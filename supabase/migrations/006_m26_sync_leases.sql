begin;

-- Only one active synchronization may run for a provider connection at a time.
-- Application code marks abandoned runs older than twenty minutes failed before
-- acquiring a new lease.
create unique index if not exists sync_runs_one_active_per_connection_idx
on public.sync_runs(connection_id)
where status = 'running';

commit;
