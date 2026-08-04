begin;

alter table public.sync_retry_jobs
  add column if not exists status text not null default 'pending'
    check (status in ('pending','leased','succeeded','dead_lettered')),
  add column if not exists attempts integer not null default 0,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists sync_retry_jobs_claim_idx
  on public.sync_retry_jobs (status, available_at, lease_expires_at);

create table if not exists public.sync_dead_letters (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  resource text not null,
  reason text not null,
  attempts integer not null,
  last_error text,
  source_retry_job_id bigint references public.sync_retry_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

alter table public.sync_dead_letters enable row level security;
create policy sync_dead_letters_owner_read on public.sync_dead_letters
  for select using (auth.uid() = user_id);

create or replace function public.claim_sync_retry_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.sync_retry_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker id is required';
  end if;

  return query
  with candidates as (
    select id
    from public.sync_retry_jobs
    where status = 'pending'
      and available_at <= now()
      and (lease_expires_at is null or lease_expires_at < now())
    order by available_at, id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  )
  update public.sync_retry_jobs jobs
  set status = 'leased',
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)))
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_sync_retry_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_retry_jobs(text, integer, integer) to service_role;

commit;
