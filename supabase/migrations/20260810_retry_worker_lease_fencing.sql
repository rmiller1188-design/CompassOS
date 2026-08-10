begin;

alter table public.sync_retry_jobs
  add column if not exists lease_token uuid;

create or replace function public.claim_sync_retry_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.sync_retry_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker id is required';
  end if;

  return query
  with candidates as (
    select id
    from public.sync_retry_jobs
    where (
      (status = 'pending' and available_at <= now())
      or (status = 'leased' and lease_expires_at <= now())
    )
    order by coalesce(available_at, lease_expires_at), id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  )
  update public.sync_retry_jobs jobs
  set status = 'leased',
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)))
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

create or replace function public.finalize_sync_retry_job(
  p_job_id bigint,
  p_worker_id text,
  p_lease_token uuid,
  p_outcome text,
  p_attempts integer default null,
  p_reason text default null,
  p_last_error text default null,
  p_available_at timestamptz default null,
  p_completed_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.sync_retry_jobs%rowtype;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 or p_lease_token is null then
    return false;
  end if;
  if p_outcome not in ('succeeded', 'pending', 'dead_lettered') then
    return false;
  end if;

  select * into v_job
  from public.sync_retry_jobs
  where id = p_job_id
    and status = 'leased'
    and lease_owner = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
  for update;

  if not found then
    return false;
  end if;

  if p_outcome = 'succeeded' then
    update public.sync_retry_jobs
    set status = 'succeeded',
        completed_at = coalesce(p_completed_at, now()),
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null
    where id = p_job_id;
    return true;
  end if;

  if p_attempts is null or p_attempts <> v_job.attempts + 1 or p_reason is null or p_last_error is null then
    return false;
  end if;

  if p_outcome = 'pending' then
    if p_available_at is null
      or p_available_at < now() + interval '1 second'
      or p_available_at > now() + interval '15 minutes' then
      return false;
    end if;
    update public.sync_retry_jobs
    set status = 'pending',
        attempts = p_attempts,
        reason = p_reason,
        last_error = p_last_error,
        available_at = p_available_at,
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null
    where id = p_job_id;
    return true;
  end if;

  insert into public.sync_dead_letters (
    user_id,
    account_id,
    resource,
    reason,
    attempts,
    last_error,
    source_retry_job_id
  ) values (
    v_job.user_id,
    v_job.account_id,
    v_job.resource,
    p_reason,
    p_attempts,
    p_last_error,
    v_job.id
  );

  update public.sync_retry_jobs
  set status = 'dead_lettered',
      attempts = p_attempts,
      reason = p_reason,
      last_error = p_last_error,
      completed_at = coalesce(p_completed_at, now()),
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null
  where id = p_job_id;

  return true;
end;
$$;

revoke all on function public.claim_sync_retry_jobs(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finalize_sync_retry_job(bigint, text, uuid, text, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_sync_retry_jobs(text, integer, integer) to service_role;
grant execute on function public.finalize_sync_retry_job(bigint, text, uuid, text, integer, text, text, timestamptz, timestamptz) to service_role;

commit;
