begin;

alter table public.outbound_actions
  add column if not exists payload_revision integer not null default 1 check (payload_revision > 0);

alter table public.audit_events
  add column if not exists previous_event_hash text,
  add column if not exists event_hash text;

create unique index if not exists audit_events_event_hash_uidx
  on public.audit_events(event_hash)
  where event_hash is not null;

create index if not exists audit_events_action_chain_idx
  on public.audit_events(action_id, occurred_at desc, id desc);

-- Outbound action state, encrypted payloads, approvals, and receipts are server-managed.
-- Browser clients may read their own rows but cannot self-approve or forge execution state.
drop policy if exists outbound_actions_owner_insert on public.outbound_actions;
drop policy if exists outbound_actions_owner_update on public.outbound_actions;
revoke insert, update, delete on public.outbound_actions from anon, authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

create or replace function private.reject_audit_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

revoke all on function private.reject_audit_event_mutation() from public, anon, authenticated;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function private.reject_audit_event_mutation();

commit;
