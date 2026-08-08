begin;

alter table public.outbound_action_reconciliations
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists lease_token uuid,
  add column if not exists lease_worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_lookup_error_code text;

create index if not exists outbound_action_reconciliations_due_idx
  on public.outbound_action_reconciliations(status, next_attempt_at, observed_at)
  where status = 'pending';

create or replace function public.claim_outbound_reconciliation(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  action_id uuid,
  attempt_count integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if coalesce(trim(p_worker_id), '') = '' then raise exception 'worker id required'; end if;
  if p_lease_seconds < 1 or p_lease_seconds > 900 then raise exception 'invalid lease duration'; end if;

  select r.action_id into v_action_id
  from public.outbound_action_reconciliations r
  where r.status = 'pending'
    and r.next_attempt_at <= now()
    and (r.lease_expires_at is null or r.lease_expires_at <= now())
  order by r.next_attempt_at asc, r.observed_at asc, r.action_id asc
  for update skip locked
  limit 1;

  if v_action_id is null then return; end if;

  update public.outbound_action_reconciliations r
  set attempt_count = r.attempt_count + 1,
      lease_token = v_token,
      lease_worker_id = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where r.action_id = v_action_id;

  return query
  select r.action_id, r.attempt_count, r.lease_token, r.lease_expires_at
  from public.outbound_action_reconciliations r
  where r.action_id = v_action_id;
end;
$$;

create or replace function public.schedule_outbound_reconciliation_retry(
  p_action_id uuid,
  p_lease_token uuid,
  p_next_attempt_at timestamptz,
  p_error_code text
)
returns public.outbound_action_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outbound_action_reconciliations;
begin
  if p_next_attempt_at <= now() then raise exception 'next attempt must be in the future'; end if;
  if coalesce(trim(p_error_code), '') = '' then raise exception 'error code required'; end if;

  update public.outbound_action_reconciliations r
  set next_attempt_at = p_next_attempt_at,
      last_lookup_error_code = p_error_code,
      lease_token = null,
      lease_worker_id = null,
      lease_expires_at = null,
      updated_at = now()
  where r.action_id = p_action_id
    and r.status = 'pending'
    and r.lease_token = p_lease_token
    and r.lease_expires_at > now()
  returning r.* into v_row;

  if v_row.action_id is null then raise exception 'active reconciliation lease required'; end if;
  return v_row;
end;
$$;

create or replace function public.release_outbound_reconciliation_lease(
  p_action_id uuid,
  p_lease_token uuid
)
returns public.outbound_action_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outbound_action_reconciliations;
begin
  update public.outbound_action_reconciliations r
  set lease_token = null,
      lease_worker_id = null,
      lease_expires_at = null,
      updated_at = now()
  where r.action_id = p_action_id
    and r.lease_token = p_lease_token
  returning r.* into v_row;

  if v_row.action_id is null then raise exception 'matching reconciliation lease required'; end if;
  return v_row;
end;
$$;

create or replace function public.exhaust_outbound_reconciliation_retry(
  p_action_id uuid,
  p_lease_token uuid,
  p_resolution_code text default 'PROVIDER_LOOKUP_RETRY_EXHAUSTED'
)
returns public.outbound_action_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.outbound_action_reconciliations;
begin
  if coalesce(trim(p_resolution_code), '') = '' then raise exception 'resolution code required'; end if;

  update public.outbound_action_reconciliations r
  set status = 'manual_review',
      resolution_code = p_resolution_code,
      resolved_at = now(),
      lease_token = null,
      lease_worker_id = null,
      lease_expires_at = null,
      updated_at = now()
  where r.action_id = p_action_id
    and r.status = 'pending'
    and r.lease_token = p_lease_token
    and r.lease_expires_at > now()
  returning r.* into v_row;

  if v_row.action_id is null then raise exception 'active reconciliation lease required'; end if;
  return v_row;
end;
$$;

revoke all on function public.claim_outbound_reconciliation(text, integer) from public, anon, authenticated;
revoke all on function public.schedule_outbound_reconciliation_retry(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.release_outbound_reconciliation_lease(uuid, uuid) from public, anon, authenticated;
revoke all on function public.exhaust_outbound_reconciliation_retry(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.claim_outbound_reconciliation(text, integer) to service_role;
grant execute on function public.schedule_outbound_reconciliation_retry(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.release_outbound_reconciliation_lease(uuid, uuid) to service_role;
grant execute on function public.exhaust_outbound_reconciliation_retry(uuid, uuid, text) to service_role;

commit;
