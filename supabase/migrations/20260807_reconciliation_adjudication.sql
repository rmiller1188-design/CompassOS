begin;

create table if not exists public.outbound_reconciliation_adjudications (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.outbound_actions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  outcome text not null check (outcome in ('confirmed_succeeded','closed_no_retry','retry_eligible')),
  evidence_kind text not null,
  evidence_ref text not null,
  provider_receipt_id text,
  payload_hash text not null,
  payload_revision integer not null check (payload_revision > 0),
  approval_revision integer not null check (approval_revision > 0),
  idempotency_key_hash text not null,
  retry_grant_expires_at timestamptz,
  retry_grant_consumed_at timestamptz,
  retry_approval_revision integer,
  retry_idempotency_key_hash text,
  decision_hash text not null unique,
  reviewed_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  check ((outcome = 'confirmed_succeeded' and provider_receipt_id is not null) or outcome <> 'confirmed_succeeded'),
  check ((outcome = 'retry_eligible' and evidence_kind = 'provider_confirmed_absence' and retry_grant_expires_at is not null) or outcome <> 'retry_eligible'),
  check ((retry_grant_consumed_at is null and retry_approval_revision is null and retry_idempotency_key_hash is null)
      or (retry_grant_consumed_at is not null and retry_approval_revision is not null and retry_idempotency_key_hash is not null))
);

create index if not exists outbound_reconciliation_adjudications_owner_idx
  on public.outbound_reconciliation_adjudications(user_id, reviewed_at desc);

alter table public.outbound_reconciliation_adjudications enable row level security;

create policy outbound_reconciliation_adjudications_owner_read
  on public.outbound_reconciliation_adjudications
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.outbound_reconciliation_adjudications from anon, authenticated;

create or replace function public.consume_reconciliation_retry_grant(
  p_action_id uuid,
  p_decision_hash text,
  p_retry_approval_revision integer,
  p_new_idempotency_key_hash text
)
returns public.outbound_reconciliation_adjudications
language plpgsql
security definer
set search_path = public
as $$
declare
  adjudication public.outbound_reconciliation_adjudications;
  action_row public.outbound_actions;
begin
  if coalesce(length(trim(p_decision_hash)), 0) = 0 then
    raise exception 'decision hash is required';
  end if;
  if coalesce(length(trim(p_new_idempotency_key_hash)), 0) = 0 then
    raise exception 'new idempotency-key hash is required';
  end if;

  select * into adjudication
  from public.outbound_reconciliation_adjudications
  where action_id = p_action_id
  for update;

  if not found then raise exception 'reconciliation adjudication not found'; end if;
  if adjudication.decision_hash is distinct from trim(p_decision_hash) then raise exception 'adjudication hash mismatch'; end if;
  if adjudication.outcome <> 'retry_eligible' then raise exception 'adjudication does not permit retry'; end if;
  if adjudication.evidence_kind <> 'provider_confirmed_absence' then raise exception 'retry evidence is insufficient'; end if;
  if adjudication.retry_grant_consumed_at is not null then raise exception 'retry grant already consumed'; end if;
  if adjudication.retry_grant_expires_at <= now() then raise exception 'retry grant expired'; end if;
  if trim(p_new_idempotency_key_hash) = adjudication.idempotency_key_hash then raise exception 'retry requires a new idempotency key'; end if;
  if p_retry_approval_revision <= adjudication.approval_revision then raise exception 'retry requires a newer approval revision'; end if;

  select * into action_row
  from public.outbound_actions
  where id = p_action_id
  for update;

  if not found then raise exception 'outbound action not found'; end if;
  if action_row.user_id is distinct from adjudication.user_id or action_row.account_id is distinct from adjudication.account_id then raise exception 'outbound action identity mismatch'; end if;
  if action_row.status <> 'approved' then raise exception 'outbound action must be freshly approved'; end if;
  if action_row.payload_hash is distinct from adjudication.payload_hash or action_row.payload_revision is distinct from adjudication.payload_revision then raise exception 'reconciled payload changed'; end if;
  if action_row.approved_payload_hash is distinct from action_row.payload_hash or action_row.approval_payload_revision is distinct from action_row.payload_revision then raise exception 'fresh approval binding is invalid'; end if;

  update public.outbound_reconciliation_adjudications
  set retry_grant_consumed_at = now(),
      retry_approval_revision = p_retry_approval_revision,
      retry_idempotency_key_hash = trim(p_new_idempotency_key_hash)
  where id = adjudication.id
  returning * into adjudication;

  return adjudication;
end;
$$;

revoke all on function public.consume_reconciliation_retry_grant(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.consume_reconciliation_retry_grant(uuid, text, integer, text) to service_role;

commit;
