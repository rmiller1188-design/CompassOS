# P7AD Review — Lease-fenced cursor advancement

## Status

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED** once the exact final documentation head passes the existing GitHub Actions production-core gate.

## Why this increment exists

P7AC prevents a worker that loses its account lease during an in-flight provider read from persisting that page. A smaller race still remained after the post-fetch heartbeat: normalized record upserts and final cursor persistence occur after the heartbeat, so a lease could expire or be replaced before the durable provider cursor is advanced. Reprocessing idempotent normalized records is acceptable; moving the provider cursor from stale ownership is not.

P7AD makes final cursor advancement a database-fenced operation. The active lease token is carried from the post-fetch heartbeat into cursor persistence. Supabase then verifies and row-locks the exact live account/provider/worker/token lease in the same transaction that writes `sync_cursors`.

## Production changes

- Mail, calendar, and contacts incremental runners retain the lease returned by their post-fetch heartbeat and pass it to final checkpoint persistence.
- `createSupabaseMailSyncStore.saveCursor` accepts an optional lease context. With a lease present it uses the fenced RPC instead of direct table upsert.
- New migration `20260810_lease_fenced_sync_cursor.sql` adds `save_sync_cursor_with_account_lease`.
- The RPC validates supported provider/resource values, an active connected account, exact worker/token ownership, and non-expired lease state.
- The matching `account_sync_leases` row is locked with `FOR UPDATE` before cursor mutation, preventing a concurrent release/reclaim from changing ownership during the fenced write transaction.
- Browser roles receive no execution authority for the RPC; execution is granted only to `service_role`.
- Fence loss/backend errors are normalized to retryable `SYNC_CURSOR_FENCE_*` controls without exposing raw database diagnostics.
- Package version is `0.47.0`.

## Safety properties

- A worker whose lease has expired, been replaced, or drifted to another account/provider cannot advance the durable sync cursor through the fenced path.
- An account that has become inactive cannot advance its cursor through the fenced RPC.
- The cursor write and lease proof are evaluated in one database transaction rather than as a check-then-write pair in application code.
- Normalized message/event/contact upserts remain idempotent. If ownership is lost after those upserts but before the final cursor write, the cursor fence fails and a later valid worker can safely replay the provider page.
- No OAuth scopes, provider write access, browser credential authority, outbound action authority, unsupported iMessage access, or fake production data paths were added.

## Deterministic coverage

`test/lease-fenced-cursor.test.js` adds coverage for:

1. lease-supplied cursor persistence routes only through `save_sync_cursor_with_account_lease`;
2. provider resource mapping is exact, including Google Calendar cursor naming;
3. lost/stale lease ownership returns a retryable `SYNC_CURSOR_FENCE_LOST` error;
4. database/backend diagnostics are sanitized;
5. account/provider scope drift is rejected before RPC execution; and
6. mail, calendar, and contacts runners all pass the current post-fetch lease into final checkpoint persistence.

The implementation candidate `bdea389ec38e863afbfea534dedf1239e5e0a2cf` passed GitHub Actions `Validate production core` run 578. The final documentation head must pass the same gate before this milestone is externally reported as reviewable.

## Infrastructure blockers

The migration has not been applied to a configured Supabase environment in this build context. Live validation is still required for PostgreSQL row-lock contention, lease expiry/reclaim races, service-role execution/RLS posture, worker crash/restart recovery, real Google/Microsoft cursor progression, and concurrent scheduler behavior. No live Supabase, provider, network, or deployed scheduler success is claimed.
