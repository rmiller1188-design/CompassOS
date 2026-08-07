create table if not exists public.outbound_reconciliation_evidence (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.outbound_actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.provider_accounts(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  action_type text not null,
  payload_hash text not null,
  payload_revision integer not null check (payload_revision > 0),
  approval_revision integer not null check (approval_revision > 0),
  idempotency_key_hash text not null,
  outcome text not null check (outcome in ('succeeded', 'not_found', 'unknown')),
  provider_receipt_id text,
  evidence_kind text not null check (evidence_kind in ('provider_confirmed_absence', 'provider_reconciliation_observation')),
  evidence_ref text not null,
  evidence_hash text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (action_id, evidence_hash),
  check (evidence_ref = 'sha256:' || evidence_hash),
  check (length(evidence_hash) = 64),
  check (length(idempotency_key_hash) = 64)
);

create index if not exists outbound_reconciliation_evidence_action_idx
  on public.outbound_reconciliation_evidence(action_id, observed_at desc);

create index if not exists outbound_reconciliation_evidence_user_idx
  on public.outbound_reconciliation_evidence(user_id, observed_at desc);

alter table public.outbound_reconciliation_evidence enable row level security;

revoke all on public.outbound_reconciliation_evidence from anon, authenticated;
grant select on public.outbound_reconciliation_evidence to authenticated;

create policy "owners can read reconciliation evidence"
  on public.outbound_reconciliation_evidence
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes intentionally remain unavailable to browser roles. Service-role workers bypass RLS
-- and are the only supported writers for immutable provider reconciliation observations.
