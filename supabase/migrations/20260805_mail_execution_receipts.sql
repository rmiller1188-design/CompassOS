begin;

alter table public.outbound_actions
  add column if not exists approved_payload_hash text,
  add column if not exists idempotency_key uuid default gen_random_uuid(),
  add column if not exists execution_attempts integer not null default 0,
  add column if not exists last_execution_error jsonb;

create unique index if not exists outbound_actions_idempotency_key_idx
  on public.outbound_actions(idempotency_key);

create table if not exists public.outbound_action_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.outbound_actions(id) on delete cascade,
  idempotency_key uuid not null,
  provider text not null check (provider in ('google','microsoft')),
  provider_message_id text,
  provider_thread_id text,
  provider_request_id text,
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (action_id),
  unique (idempotency_key)
);

alter table public.outbound_action_receipts enable row level security;

create policy outbound_action_receipts_owner_read
  on public.outbound_action_receipts for select
  using (auth.uid() = user_id);

-- Execution claims, action status changes, encrypted payload access, and receipt inserts
-- remain service-role-only. Browser roles receive no insert/update/delete policy.

commit;
