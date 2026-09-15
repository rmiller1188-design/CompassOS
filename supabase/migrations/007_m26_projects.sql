begin;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  client_name text,
  project_number text,
  status text not null default 'active' check (status in ('lead','bidding','active','on_hold','complete','cancelled')),
  phase text,
  location text,
  bid_due_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  estimated_value numeric(14,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('estimate','rfi','submittal','task','milestone','issue','note')),
  title text not null,
  status text not null default 'open' check (status in ('open','in_progress','waiting','submitted','approved','rejected','done','cancelled')),
  due_at timestamptz,
  assignee text,
  reference_number text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('communication','calendar_event','person','file','action_request')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(project_id,entity_type,entity_id)
);

create index if not exists projects_workspace_status_idx on public.projects(workspace_id,status,updated_at desc);
create index if not exists project_items_project_status_idx on public.project_items(project_id,status,due_at);
create index if not exists project_links_project_idx on public.project_links(project_id,entity_type);

alter table public.projects enable row level security;
alter table public.project_items enable row level security;
alter table public.project_links enable row level security;

create policy projects_member_select on public.projects for select to authenticated using (public.is_workspace_member(workspace_id));
create policy projects_owner_insert on public.projects for insert to authenticated with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy projects_owner_update on public.projects for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid() and public.is_workspace_member(workspace_id));
create policy projects_owner_delete on public.projects for delete to authenticated using (owner_id=auth.uid());

create policy project_items_member_select on public.project_items for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and public.is_workspace_member(p.workspace_id))
);
create policy project_items_owner_insert on public.project_items for insert to authenticated with check (
  owner_id=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=auth.uid())
);
create policy project_items_owner_update on public.project_items for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy project_items_owner_delete on public.project_items for delete to authenticated using (owner_id=auth.uid());

create policy project_links_member_select on public.project_links for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and public.is_workspace_member(p.workspace_id))
);
create policy project_links_owner_all on public.project_links for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());

commit;
