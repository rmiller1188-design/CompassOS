begin;

-- Server-only transaction boundary for creating the single shared "Us"
-- workspace associated with a user. The advisory lock prevents concurrent
-- requests from creating duplicate shared workspaces.
create or replace function public.server_get_or_create_shared_workspace(
  target_user uuid,
  target_name text default 'Us'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  workspace_id uuid;
  normalized_name text;
begin
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  normalized_name := left(coalesce(nullif(trim(target_name), ''), 'Us'), 80);
  perform pg_advisory_xact_lock(hashtextextended('compass-us:' || target_user::text, 0));

  select wm.workspace_id
    into workspace_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = target_user
    and w.kind = 'shared'
  order by w.created_at
  limit 1;

  if workspace_id is not null then
    return workspace_id;
  end if;

  insert into public.workspaces(name, kind, created_by)
  values (normalized_name, 'shared', target_user)
  returning id into workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (workspace_id, target_user, 'owner');

  return workspace_id;
end;
$$;

-- Server-only, email-bound invitation consumption. The invitation row is
-- locked while it is validated, consumed, and converted into membership.
create or replace function public.server_accept_workspace_invitation(
  target_user uuid,
  target_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite public.workspace_invitations%rowtype;
  user_email text;
begin
  select lower(email)
    into user_email
  from auth.users
  where id = target_user;

  if user_email is null then
    raise exception 'USER_EMAIL_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
    into invite
  from public.workspace_invitations
  where token_hash = target_token_hash
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if invite.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED' using errcode = 'P0001';
  end if;
  if invite.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
  end if;
  if lower(invite.email) <> user_email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (invite.workspace_id, target_user, 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
  set accepted_at = now(), accepted_by = target_user
  where id = invite.id
    and accepted_at is null;

  if not found then
    raise exception 'INVITATION_ALREADY_ACCEPTED' using errcode = 'P0001';
  end if;

  return invite.workspace_id;
end;
$$;

revoke all on function public.server_get_or_create_shared_workspace(uuid,text) from public, anon, authenticated;
revoke all on function public.server_accept_workspace_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.server_get_or_create_shared_workspace(uuid,text) to service_role;
grant execute on function public.server_accept_workspace_invitation(uuid,text) to service_role;

commit;
