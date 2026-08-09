begin;

create table if not exists public.account_sync_leases (
  account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  lease_owner text not null,
  lease_token uuid not null default gen_random_uuid(),
  lease_started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists account_sync_leases_expiry_idx on public.account_sync_leases (lease_expires_at);

alter table public.account_sync_leases enable row level security;

-- No anon/authenticated policies are defined. Sync lease authority is service-role only.
revoke all on public.account_sync_leases from anon, authenticated;

create or replace function public.claim_account_sync_lease(
  p_account_id uuid,
  p_provider text,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.account_sync_leases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id required';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'lease duration out of bounds';
  end if;

  return query
  insert into public.account_sync_leases as l (
    account_id, provider, lease_owner, lease_token, lease_started_at, lease_expires_at, updated_at
  )
  select a.id, a.provider, p_worker_id, gen_random_uuid(), now(), now() + make_interval(secs => p_lease_seconds), now()
  from public.connected_accounts a
  where a.id = p_account_id
    and a.provider = p_provider
    and a.status = 'active'
  on conflict (account_id) do update
    set provider = excluded.provider,
        lease_owner = excluded.lease_owner,
        lease_token = gen_random_uuid(),
        lease_started_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    where l.lease_expires_at <= now() or l.lease_owner = p_worker_id
  returning l.*;
end;
$$;

create or replace function public.heartbeat_account_sync_lease(
  p_account_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns setof public.account_sync_leases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lease_seconds < 5 or p_lease_seconds > 900 then
    raise exception 'lease duration out of bounds';
  end if;

  return query
  update public.account_sync_leases l
  set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where l.account_id = p_account_id
    and l.lease_owner = p_worker_id
    and l.lease_token = p_lease_token
    and l.lease_expires_at > now()
  returning l.*;
end;
$$;

create or replace function public.release_account_sync_lease(
  p_account_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with deleted as (
    delete from public.account_sync_leases l
    where l.account_id = p_account_id
      and l.lease_owner = p_worker_id
      and l.lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from deleted);
$$;

revoke all on function public.claim_account_sync_lease(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_account_sync_lease(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_account_sync_lease(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_account_sync_lease(uuid, text, text, integer) to service_role;
grant execute on function public.heartbeat_account_sync_lease(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_account_sync_lease(uuid, text, uuid) to service_role;

commit;
