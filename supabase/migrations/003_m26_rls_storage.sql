begin;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.sync_runs enable row level security;
alter table public.communication_items enable row level security;
alter table public.calendar_events enable row level security;
alter table public.people enable row level security;
alter table public.shared_tasks enable row level security;
alter table public.file_entries enable row level security;
alter table public.share_intake_items enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.ai_briefs enable row level security;
alter table public.action_requests enable row level security;

create policy workspaces_member_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_creator_insert on public.workspaces for insert to authenticated with check (created_by=auth.uid());
create policy workspaces_admin_update on public.workspaces for update to authenticated using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy members_member_select on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy members_admin_insert on public.workspace_members for insert to authenticated with check (public.is_workspace_admin(workspace_id) or user_id=auth.uid());
create policy members_admin_update on public.workspace_members for update to authenticated using (public.is_workspace_admin(workspace_id));
create policy members_admin_delete on public.workspace_members for delete to authenticated using (public.is_workspace_admin(workspace_id) or user_id=auth.uid());

create policy profiles_owner_select on public.profiles for select to authenticated using (owner_id=auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

create policy connections_owner_all on public.provider_connections for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy sync_runs_owner_select on public.sync_runs for select to authenticated using (owner_id=auth.uid());

create policy communications_member_select on public.communication_items for select to authenticated using (public.is_workspace_member(workspace_id));
create policy communications_owner_insert on public.communication_items for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy communications_owner_update on public.communication_items for update to authenticated using (owner_id=auth.uid());
create policy communications_owner_delete on public.communication_items for delete to authenticated using (owner_id=auth.uid());

create policy events_member_select on public.calendar_events for select to authenticated using (public.is_workspace_member(workspace_id));
create policy events_owner_insert on public.calendar_events for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy events_owner_update on public.calendar_events for update to authenticated using (owner_id=auth.uid());
create policy events_owner_delete on public.calendar_events for delete to authenticated using (owner_id=auth.uid());

create policy people_member_select on public.people for select to authenticated using (public.is_workspace_member(workspace_id));
create policy people_owner_all on public.people for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));

create policy tasks_member_select on public.shared_tasks for select to authenticated using (public.is_workspace_member(workspace_id));
create policy tasks_member_insert on public.shared_tasks for insert to authenticated with check (created_by=auth.uid() and public.is_workspace_member(workspace_id));
create policy tasks_member_update on public.shared_tasks for update to authenticated using (public.is_workspace_member(workspace_id));
create policy tasks_member_delete on public.shared_tasks for delete to authenticated using (created_by=auth.uid() or public.is_workspace_admin(workspace_id));

create policy files_member_select on public.file_entries for select to authenticated using (public.is_workspace_member(workspace_id));
create policy files_owner_insert on public.file_entries for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy files_owner_update on public.file_entries for update to authenticated using (owner_id=auth.uid());
create policy files_owner_delete on public.file_entries for delete to authenticated using (owner_id=auth.uid());

create policy intake_member_select on public.share_intake_items for select to authenticated using (public.is_workspace_member(workspace_id));
create policy intake_owner_insert on public.share_intake_items for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy intake_owner_update on public.share_intake_items for update to authenticated using (owner_id=auth.uid());
create policy intake_owner_delete on public.share_intake_items for delete to authenticated using (owner_id=auth.uid());

create policy invitations_admin_select on public.workspace_invitations for select to authenticated using (public.is_workspace_admin(workspace_id));
create policy invitations_admin_insert on public.workspace_invitations for insert to authenticated with check (invited_by=auth.uid() and public.is_workspace_admin(workspace_id));
create policy invitations_admin_update on public.workspace_invitations for update to authenticated using (public.is_workspace_admin(workspace_id));
create policy invitations_admin_delete on public.workspace_invitations for delete to authenticated using (public.is_workspace_admin(workspace_id));

create policy briefs_member_select on public.ai_briefs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy briefs_owner_insert on public.ai_briefs for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));

create policy actions_member_select on public.action_requests for select to authenticated using (public.is_workspace_member(workspace_id));
create policy actions_owner_insert on public.action_requests for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy actions_approver_update on public.action_requests for update to authenticated using (public.is_workspace_member(workspace_id));

revoke all on public.provider_credentials from anon, authenticated;
revoke all on public.sync_runs from anon;

grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke all on public.provider_credentials from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('compass-files','compass-files',false,78643200,null)
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit;

create policy compass_storage_select on storage.objects for select to authenticated using (
  bucket_id='compass-files' and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
);
create policy compass_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='compass-files'
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  and ((storage.foldername(name))[2])::uuid=auth.uid()
);
create policy compass_storage_update on storage.objects for update to authenticated using (
  bucket_id='compass-files' and owner_id::uuid=auth.uid()
) with check (
  bucket_id='compass-files' and owner_id::uuid=auth.uid()
);
create policy compass_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='compass-files' and owner_id::uuid=auth.uid()
);


commit;
