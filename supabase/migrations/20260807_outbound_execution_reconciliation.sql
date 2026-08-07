begin;

create table if not exists public.outbound_action_reconciliations (
  action_id uuid primary key references public.outbound_actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete restrict,
  provider text not null check (provider in ('google','microsoft')),
  action_type text not null,
  idempotency_key_hash text not null,
  payload_hash text not null,
  payload_revision integer not null check (payload_revision > 0),
  approval_revision integer not null check (approval_revision > 0),
  worker_id text not null,
  reason_code text not null,
  provider_receipt_id text,
  policy_decision_hash text,
  status text not null default 'pending' check (status in ('pending','resolved_succeeded','resolved_failed','manual_review')),
  resolution_code text,
  observed_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and resolved_at is null) or status <> 'pending')
);

create index if not exists outbound_action_reconciliations_owner_idx
  on public.outbound_action_reconciliations(user_id, status, observed_at desc);

alter table public.outbound_action_reconciliations enable row level security;

create policy outbound_action_reconciliations_owner_read
  on public.outbound_action_reconciliations
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.outbound_action_reconciliations from anon, authenticated;

-- Reconciliation is intentionally service-role managed. A browser may inspect its own
-- cases, but cannot manufacture, resolve, or suppress an ambiguous provider outcome.

commit;
