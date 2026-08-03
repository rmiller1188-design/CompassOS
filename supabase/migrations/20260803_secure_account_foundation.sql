begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  provider_subject text not null,
  email text not null,
  display_name text,
  granted_scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','reauth_required','revoked','error')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_subject)
);

create table if not exists private.provider_tokens (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  envelope jsonb not null,
  key_version integer not null default 1,
  refresh_lock_until timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  nonce_hash text not null unique,
  pkce_verifier_envelope jsonb not null,
  redirect_to text not null default '/',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_cursors (
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  resource text not null check (resource in ('gmail_history','graph_mail_delta','google_calendar_sync','graph_calendar_delta','contacts')),
  cursor text,
  watermark timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  failure_count integer not null default 0,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (account_id, resource)
);

create table if not exists public.outbound_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete restrict,
  action_type text not null,
  payload_ciphertext jsonb not null,
  payload_hash text not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','executing','succeeded','failed','rejected','cancelled')),
  revision integer not null default 1,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  provider_result_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid references public.outbound_actions(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

alter table public.connected_accounts enable row level security;
alter table public.oauth_states enable row level security;
alter table public.sync_cursors enable row level security;
alter table public.outbound_actions enable row level security;
alter table public.audit_events enable row level security;

create policy connected_accounts_owner_read on public.connected_accounts for select using (auth.uid() = user_id);
create policy connected_accounts_owner_delete on public.connected_accounts for delete using (auth.uid() = user_id);
create policy oauth_states_owner_read on public.oauth_states for select using (auth.uid() = user_id);
create policy sync_cursors_owner_read on public.sync_cursors for select using (
  exists (select 1 from public.connected_accounts a where a.id = account_id and a.user_id = auth.uid())
);
create policy outbound_actions_owner_read on public.outbound_actions for select using (auth.uid() = user_id);
create policy outbound_actions_owner_insert on public.outbound_actions for insert with check (auth.uid() = user_id and status in ('draft','pending_approval'));
create policy outbound_actions_owner_update on public.outbound_actions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy audit_events_owner_read on public.audit_events for select using (auth.uid() = user_id);

-- Provider token envelopes intentionally have no client policies and live outside the exposed public schema.
-- OAuth callback, token refresh, sync cursor writes, and audit event inserts must run server-side with the service role.

commit;
