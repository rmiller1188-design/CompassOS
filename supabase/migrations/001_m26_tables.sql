begin;

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('personal','shared')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  personal_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'personal' check (kind in ('personal')),
  display_name text not null,
  avatar_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,kind)
);

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  external_account_id text not null,
  account_email text not null,
  display_name text,
  status text not null default 'healthy' check (status in ('healthy','syncing','error','reauth_required','disconnected')),
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,provider,external_account_id)
);

create table if not exists public.provider_credentials (
  connection_id uuid primary key references public.provider_connections(id) on delete cascade,
  encrypted_payload text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running','completed','failed')),
  item_counts jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.communication_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  connection_id uuid references public.provider_connections(id) on delete cascade,
  provider text not null,
  external_id text not null,
  thread_external_id text,
  channel text not null check (channel in ('email','sms','call','voicemail','share','other')),
  direction text not null default 'inbound' check (direction in ('inbound','outbound','internal')),
  subject text,
  sender text,
  recipients text[] not null default '{}',
  preview text,
  body_text text,
  occurred_at timestamptz not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,connection_id,external_id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  connection_id uuid references public.provider_connections(id) on delete cascade,
  provider text not null,
  external_id text not null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  attendees jsonb not null default '[]'::jsonb,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,connection_id,external_id)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  connection_id uuid references public.provider_connections(id) on delete cascade,
  provider text not null,
  external_id text not null,
  display_name text not null,
  email_addresses text[] not null default '{}',
  phone_numbers text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,connection_id,external_id)
);

create table if not exists public.shared_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 78643200),
  visibility text not null default 'private' check (visibility in ('private','shared')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.share_intake_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visibility text not null check (visibility in ('private','shared')),
  item_type text not null check (item_type in ('text','url','image','video','file')),
  note text,
  source_url text,
  file_entry_id uuid references public.file_entries(id) on delete set null,
  status text not null default 'ready' check (status in ('ready','processed','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brief jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.action_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connection_id uuid references public.provider_connections(id) on delete set null,
  action_type text not null,
  risk_level text not null default 'external_write' check (risk_level in ('internal','external_write','financial')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','executing','completed','failed','expired')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_items_workspace_time_idx on public.communication_items(workspace_id,occurred_at desc);
create index if not exists calendar_events_workspace_start_idx on public.calendar_events(workspace_id,starts_at);
create index if not exists people_workspace_name_idx on public.people(workspace_id,display_name);
create index if not exists provider_connections_owner_idx on public.provider_connections(owner_id,status);
create index if not exists file_entries_workspace_idx on public.file_entries(workspace_id,created_at desc);

commit;
