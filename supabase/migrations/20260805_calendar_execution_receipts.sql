begin;

alter table public.outbound_action_receipts
  add column if not exists provider_event_id text,
  add column if not exists provider_calendar_id text,
  add column if not exists provider_web_link text;

create index if not exists outbound_action_receipts_provider_event_idx
  on public.outbound_action_receipts(provider, provider_event_id)
  where provider_event_id is not null;

-- Calendar action claims, encrypted payload reads, action transitions, and receipt writes
-- remain service-role-only through the existing outbound action execution boundary.
-- The existing owner-read RLS policy applies to these additional receipt fields.

commit;
