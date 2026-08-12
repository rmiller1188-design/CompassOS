begin;

-- Internal bootstrap functions are trigger-only. Do not expose arbitrary-user
-- security-definer entry points to browser roles.
revoke execute on function public.bootstrap_compass_user(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

-- Workspace membership predicates are intentionally available to authenticated
-- users because RLS policies call them. Anonymous callers do not need them.
revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

-- Prevent a user from self-inserting into an arbitrary workspace UUID.
drop policy if exists members_admin_insert on public.workspace_members;
create policy members_admin_insert
on public.workspace_members
for insert
to authenticated
with check (public.is_workspace_admin(workspace_id));

-- Private file metadata remains visible only to its owner. Shared metadata is
-- visible to current members of the selected workspace.
drop policy if exists files_member_select on public.file_entries;
create policy files_owner_or_shared_select
on public.file_entries
for select
to authenticated
using (
  owner_id = auth.uid()
  or (visibility = 'shared' and public.is_workspace_member(workspace_id))
);

drop policy if exists files_owner_update on public.file_entries;
create policy files_owner_update
on public.file_entries
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists intake_member_select on public.share_intake_items;
create policy intake_owner_or_shared_select
on public.share_intake_items
for select
to authenticated
using (
  owner_id = auth.uid()
  or (visibility = 'shared' and public.is_workspace_member(workspace_id))
);

drop policy if exists intake_owner_update on public.share_intake_items;
create policy intake_owner_update
on public.share_intake_items
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid() and public.is_workspace_member(workspace_id));

-- Approval records are server-controlled until the explicit approval endpoint
-- and immutable-field enforcement are implemented.
drop policy if exists actions_approver_update on public.action_requests;
revoke update on public.action_requests from authenticated;

-- New object paths are:
--   workspace_uuid / private|shared / owner_uuid / filename
-- This makes visibility enforceable at the storage layer instead of relying
-- only on metadata in public.file_entries.
drop policy if exists compass_storage_select on storage.objects;
drop policy if exists compass_storage_insert on storage.objects;
drop policy if exists compass_storage_update on storage.objects;
drop policy if exists compass_storage_delete on storage.objects;

create policy compass_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'compass-files'
  and (
    (
      (storage.foldername(name))[2] = 'private'
      and ((storage.foldername(name))[3])::uuid = auth.uid()
    )
    or
    (
      (storage.foldername(name))[2] = 'shared'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    )
  )
);

create policy compass_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'compass-files'
  and (storage.foldername(name))[2] in ('private','shared')
  and ((storage.foldername(name))[3])::uuid = auth.uid()
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

create policy compass_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'compass-files'
  and ((storage.foldername(name))[3])::uuid = auth.uid()
)
with check (
  bucket_id = 'compass-files'
  and (storage.foldername(name))[2] in ('private','shared')
  and ((storage.foldername(name))[3])::uuid = auth.uid()
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);

create policy compass_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'compass-files'
  and ((storage.foldername(name))[3])::uuid = auth.uid()
);

commit;
