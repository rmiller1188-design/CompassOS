begin;

create extension if not exists vector;

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','deleted')),
  revision integer not null default 1 check (revision > 0),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.semantic_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('message','thread','event','contact','commitment','memory')),
  source_id text not null,
  content text not null check (length(trim(content)) > 0),
  provenance jsonb not null default '[]'::jsonb,
  embedding vector(1536) not null,
  expires_at timestamptz,
  deleted_at timestamptz,
  indexed_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create index if not exists semantic_documents_user_source_idx on public.semantic_documents(user_id, source_type);
create index if not exists semantic_documents_embedding_idx on public.semantic_documents using hnsw (embedding vector_cosine_ops);

create table if not exists public.semantic_retrieval_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query_text text not null,
  result_ids uuid[] not null default '{}',
  source_types text[] not null default '{}',
  occurred_at timestamptz not null default now()
);

alter table public.memory_items enable row level security;
alter table public.semantic_documents enable row level security;
alter table public.semantic_retrieval_audit enable row level security;

create policy memory_items_owner_read on public.memory_items for select using (auth.uid() = user_id);
create policy memory_items_owner_insert on public.memory_items for insert with check (auth.uid() = user_id and status = 'active');
create policy memory_items_owner_update on public.memory_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy memory_items_owner_delete on public.memory_items for delete using (auth.uid() = user_id);
create policy semantic_documents_owner_read on public.semantic_documents for select using (auth.uid() = user_id);
create policy semantic_retrieval_audit_owner_read on public.semantic_retrieval_audit for select using (auth.uid() = user_id);

create or replace function public.match_compass_documents_for_user(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 10,
  p_min_similarity double precision default 0,
  p_source_types text[] default '{}'
)
returns table (
  id uuid,
  user_id uuid,
  source_type text,
  source_id text,
  content text,
  provenance jsonb,
  indexed_at timestamptz,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select d.id, d.user_id, d.source_type, d.source_id, d.content, d.provenance, d.indexed_at,
    1 - (d.embedding <=> p_query_embedding) as similarity
  from public.semantic_documents d
  where d.user_id = p_user_id
    and d.deleted_at is null
    and (d.expires_at is null or d.expires_at > now())
    and (coalesce(array_length(p_source_types, 1), 0) = 0 or d.source_type = any(p_source_types))
    and 1 - (d.embedding <=> p_query_embedding) >= p_min_similarity
  order by d.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 50));
$$;

revoke all on function public.match_compass_documents_for_user(uuid, vector, integer, double precision, text[]) from public, anon, authenticated;
grant execute on function public.match_compass_documents_for_user(uuid, vector, integer, double precision, text[]) to service_role;

-- Semantic document writes and retrieval audit inserts intentionally have no browser policies.
-- Indexing and retrieval run server-side with a user-bound adapter and the service role.

commit;
