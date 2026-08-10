# P7AG — Retry Worker Lease-Token Fencing

## Disposition

**CANDIDATE / LIVE VALIDATION BLOCKED.** P7AG becomes reviewable only after the exact final source/documentation head passes the repository `Validate production core` pull-request gate.

## Production problem closed

P7AF removed raw executor diagnostics from durable retry state, but the retry worker still had two concurrency/recovery gaps. First, successful, rescheduled, and dead-lettered mutations were guarded only by `job.id` plus a stable `lease_owner`. A stale process using the same worker identity could therefore remain capable of mutating a job after ownership had rotated. Second, `claim_sync_retry_jobs` only selected `pending` rows, so a process crash could leave an expired row permanently stranded in `leased` state.

P7AG makes retry ownership generation-specific and recoverable.

## Production changes

- `sync_retry_jobs` receives a rotating UUID `lease_token`.
- Every retry claim mints a new token and returns exact job/worker/token ownership.
- Claim now includes expired `leased` rows as well as due `pending` rows, using `FOR UPDATE SKIP LOCKED` for contention-safe reclaim.
- `src/sync/retry-worker.js` rejects incomplete claims before executor work and routes success, reschedule, and dead-letter outcomes exclusively through `finalize_sync_retry_job`.
- `finalize_sync_retry_job` row-locks the exact leased job and verifies job id, worker id, lease token, and unexpired ownership in the same transaction as state mutation.
- A stale/replaced/expired worker receives a negative fence result and cannot mutate retry state or create a dead letter.
- Dead-letter insertion and the retry-job terminal transition are atomic in one database transaction.
- Failed attempts must advance by exactly one. Pending retries must be scheduled between 1 second and 15 minutes from database time, preserving the existing bounded retry policy as defense in depth.
- Retry backend failures cross the application boundary as stable application-owned control errors rather than raw Supabase diagnostics.
- Package version is `0.50.0`.

## Security and authority posture

P7AG adds no OAuth scope, provider-write authority, browser credential access, outbound-action bypass, unsupported iMessage access, or fake production data. The claim and finalization RPCs remain service-role only. P7AF safe diagnostic canonicalization remains in force, and this increment does not alter explicit approval, policy, idempotency, reconciliation, audit, RLS, or user-controlled memory authority.

## Deterministic validation target

The exact final branch head must pass `npm run validate`, including production-core syntax checks and the complete deterministic Node test suite. Added coverage verifies exact lease-token finalization, safe reschedule/dead-letter payloads, stale-lease fencing, malformed-claim rejection before execution, backend diagnostic sanitization, expired-lease reclaim SQL, token rotation, row locking, exact attempt advancement, bounded database retry scheduling, and service-role-only function authority.

The authoritative exact-head CI evidence is recorded on the draft P7AG pull request after validation completes.

## Reviewer checklist

- Verify expired `leased` jobs are reclaimable and no longer stranded after worker failure.
- Verify every claim rotates `lease_token` and finalization requires the exact returned token.
- Verify stale workers cannot complete, reschedule, or dead-letter a job after lease expiry/reclaim.
- Verify dead-letter insertion and job terminal state transition occur atomically.
- Verify failed attempts advance exactly once and pending retry scheduling remains within 1 second–15 minutes.
- Verify raw executor and Supabase diagnostics cannot cross durable retry or worker-control boundaries.
- Verify browser roles receive no claim/finalization authority and no outbound provider authority changes.

## Infrastructure blockers

Not validated live in this build context: applying the new Supabase migration, PostgreSQL row-lock contention, service-role RPC/RLS behavior, true multi-worker lease expiry/reclaim races, worker crash/restart during executor work, atomic dead-letter behavior under transaction faults, and deployed retry-worker execution. No live Google, Microsoft, Supabase, network, or deployed-runtime success is claimed.
