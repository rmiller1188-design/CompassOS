create table if not exists public.oauth_states (
  nonce_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  verifier_envelope jsonb not null,
  redirect_uri text not null,
  redirect_to text not null default '/',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;

create table if not exists public.oauth_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text check (provider is null or provider in ('google','microsoft')),
  connection_id uuid references public.provider_connections(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.oauth_audit_events enable row level security;
revoke all on public.oauth_audit_events from anon, authenticated;

create or replace function public.consume_oauth_state(p_nonce_hash text)
returns table (
  nonce_hash text,
  owner_id uuid,
  provider text,
  verifier_envelope jsonb,
  redirect_uri text,
  redirect_to text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.oauth_states s
     set consumed_at = now()
   where s.nonce_hash = p_nonce_hash
     and s.consumed_at is null
     and s.expires_at > now()
  returning s.nonce_hash, s.owner_id, s.provider, s.verifier_envelope,
            s.redirect_uri, s.redirect_to, s.expires_at, s.created_at;
end;
$$;

revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

create or replace function public.upsert_provider_connection_with_credential(
  p_owner_id uuid,
  p_provider text,
  p_external_account_id text,
  p_account_email text,
  p_display_name text,
  p_scopes text[],
  p_token_expires_at timestamptz,
  p_encrypted_payload text,
  p_iv text,
  p_auth_tag text,
  p_key_version integer default 1
)
returns public.provider_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_connection public.provider_connections%rowtype;
begin
  if p_provider not in ('google','microsoft') then
    raise exception 'unsupported provider';
  end if;

  select * into v_profile
    from public.profiles
   where owner_id = p_owner_id and kind = 'personal'
   limit 1;

  if not found then
    raise exception 'personal profile not found';
  end if;

  insert into public.provider_connections (
    owner_id, profile_id, workspace_id, provider, external_account_id,
    account_email, display_name, status, scopes, token_expires_at,
    last_error, updated_at
  ) values (
    p_owner_id, v_profile.id, v_profile.personal_workspace_id, p_provider,
    p_external_account_id, p_account_email, p_display_name, 'healthy',
    coalesce(p_scopes, '{}'::text[]), p_token_expires_at, null, now()
  )
  on conflict (owner_id, provider, external_account_id)
  do update set
    profile_id = excluded.profile_id,
    workspace_id = excluded.workspace_id,
    account_email = excluded.account_email,
    display_name = excluded.display_name,
    status = 'healthy',
    scopes = excluded.scopes,
    token_expires_at = excluded.token_expires_at,
    last_error = null,
    updated_at = now()
  returning * into v_connection;

  insert into public.provider_credentials (
    connection_id, encrypted_payload, iv, auth_tag, key_version, updated_at
  ) values (
    v_connection.id, p_encrypted_payload, p_iv, p_auth_tag, p_key_version, now()
  )
  on conflict (connection_id)
  do update set
    encrypted_payload = excluded.encrypted_payload,
    iv = excluded.iv,
    auth_tag = excluded.auth_tag,
    key_version = excluded.key_version,
    updated_at = now();

  return v_connection;
end;
$$;

revoke all on function public.upsert_provider_connection_with_credential(uuid,text,text,text,text,text[],timestamptz,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.upsert_provider_connection_with_credential(uuid,text,text,text,text,text[],timestamptz,text,text,text,integer) to service_role;

create index if not exists oauth_states_owner_created_idx
  on public.oauth_states(owner_id, created_at desc);
create index if not exists oauth_states_expiry_idx
  on public.oauth_states(expires_at) where consumed_at is null;
create index if not exists oauth_audit_owner_created_idx
  on public.oauth_audit_events(owner_id, created_at desc);
