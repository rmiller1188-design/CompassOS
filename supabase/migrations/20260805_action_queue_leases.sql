alter table public.outbound_actions
  add column if not exists lease_owner text,
  add column if not exists lease_started_at timestamptz,
  add column if not exists lease_expires_at timestamptz;

create index if not exists outbound_actions_approved_queue_idx
  on public.outbound_actions (created_at, id)
  where status = 'approved';

create index if not exists outbound_actions_expired_lease_idx
  on public.outbound_actions (lease_expires_at, id)
  where status = 'executing';

create or replace function public.claim_next_outbound_action(
  p_worker_id text,
  p_lease_seconds integer default 60,
  p_action_types text[] default null
)
returns setof public.outbound_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if coalesce(length(trim(p_worker_id)), 0) = 0 then
    raise exception 'worker id is required';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'lease seconds must be between 5 and 900';
  end if;

  select id into claimed_id
  from public.outbound_actions
  where status = 'approved'
    and (p_action_types is null or action_type = any(p_action_types))
  order by created_at asc, id asc
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  return query
  update public.outbound_actions
  set status = 'executing',
      revision = revision + 1,
      lease_owner = trim(p_worker_id),
      lease_started_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where id = claimed_id and status = 'approved'
  returning *;
end;
$$;

create or replace function public.recover_expired_outbound_action_leases(p_limit integer default 100)
returns table(action_id uuid, previous_worker_id text, recovered_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'recovery limit must be between 1 and 1000';
  end if;

  return query
  with candidates as (
    select id, lease_owner
    from public.outbound_actions
    where status = 'executing' and lease_expires_at <= now()
    order by lease_expires_at asc, id asc
    for update skip locked
    limit p_limit
  ), recovered as (
    update public.outbound_actions a
    set status = 'failed',
        revision = revision + 1,
        lease_owner = null,
        lease_started_at = null,
        lease_expires_at = null,
        updated_at = now()
    from candidates c
    where a.id = c.id
    returning a.id, c.lease_owner
  )
  select recovered.id, recovered.lease_owner, now() from recovered;
end;
$$;

revoke all on function public.claim_next_outbound_action(text, integer, text[]) from public, anon, authenticated;
revoke all on function public.recover_expired_outbound_action_leases(integer) from public, anon, authenticated;
grant execute on function public.claim_next_outbound_action(text, integer, text[]) to service_role;
grant execute on function public.recover_expired_outbound_action_leases(integer) to service_role;

create or replace function public.prevent_client_lease_mutation()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' and (
    new.lease_owner is distinct from old.lease_owner or
    new.lease_started_at is distinct from old.lease_started_at or
    new.lease_expires_at is distinct from old.lease_expires_at
  ) then
    raise exception 'execution lease fields are service-role managed';
  end if;
  return new;
end;
$$;

drop trigger if exists outbound_actions_protect_lease_fields on public.outbound_actions;
create trigger outbound_actions_protect_lease_fields
before update on public.outbound_actions
for each row execute function public.prevent_client_lease_mutation();
