begin;

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  thread_key text not null,
  subject text not null default '',
  participant_emails text[] not null default '{}',
  latest_message_at timestamptz not null,
  unread_count integer not null default 0 check (unread_count >= 0),
  message_count integer not null default 0 check (message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, thread_key)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  thread_id uuid references public.message_threads(id) on delete set null,
  provider text not null check (provider in ('google','microsoft')),
  provider_message_id text not null,
  thread_key text not null,
  internet_message_id text,
  subject text not null default '',
  snippet text not null default '',
  sender_email text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  sent_at timestamptz not null,
  received_at timestamptz not null,
  is_read boolean not null default false,
  has_attachments boolean not null default false,
  raw_ref jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);

create index if not exists messages_account_received_idx on public.messages (account_id, received_at desc);
create index if not exists messages_thread_received_idx on public.messages (account_id, thread_key, received_at desc);
create index if not exists message_threads_account_latest_idx on public.message_threads (account_id, latest_message_at desc);

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  resource text not null,
  status text not null check (status in ('succeeded','failed')),
  mode text not null check (mode in ('bootstrap','incremental')),
  pages integer not null default 0 check (pages >= 0),
  written integer not null default 0 check (written >= 0),
  retryable boolean,
  reason text,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists sync_runs_account_finished_idx on public.sync_runs (account_id, finished_at desc);

create table if not exists public.sync_retry_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  resource text not null,
  reason text not null,
  attempt integer not null default 0 check (attempt >= 0),
  available_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','leased','completed','dead_letter')),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_retry_jobs_ready_idx on public.sync_retry_jobs (status, available_at);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_retry_jobs enable row level security;

create policy message_threads_owner_read on public.message_threads for select using (auth.uid() = user_id);
create policy messages_owner_read on public.messages for select using (auth.uid() = user_id);
create policy sync_runs_owner_read on public.sync_runs for select using (auth.uid() = user_id);
create policy sync_retry_jobs_owner_read on public.sync_retry_jobs for select using (auth.uid() = user_id);

-- Ingestion writes are intentionally omitted from authenticated-client policies.
-- The server-side sync worker must use the service role after independently verifying account ownership.

commit;
