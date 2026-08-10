# P7AF — Retry Worker Diagnostic Persistence Safety

## Review scope
P7AF closes the retry-consumer leakage path left after P7AE. P7AE canonicalized failed sync-run persistence and the initial retry enqueue, but `src/sync/retry-worker.js` still copied the raw exception thrown by a retry executor into `sync_retry_jobs.last_error` and, after exhaustion, into `sync_dead_letters.last_error`. Because those records are durable and owner-visible, arbitrary provider diagnostics, bearer material, URLs, cursors, email addresses, or other exception text could still cross the persistence boundary during later retry attempts.

P7AF makes retry reschedule and dead-letter persistence consume the same canonical sync-failure safety policy used by the producer side. Executor exception text remains in process only; durable retry diagnostics are derived from the stored semantic reason and replaced with stable application-owned text.

## Production changes
- `src/sync/retry-worker.js` imports and applies `createSafeSyncFailureRecord` before retry or dead-letter persistence.
- Raw executor exception text is no longer used for `sync_retry_jobs.last_error` or `sync_dead_letters.last_error`.
- Stored retry reasons are re-canonicalized before persistence instead of being copied forward blindly.
- Unknown or tampered stored reasons fail closed to `sync_failure` / `Synchronization failed`.
- Exponential retry delay remains bounded by the existing 1-second minimum and 15-minute ceiling through the canonical failure record.
- Dead-letter and retry-job rows receive the same sanitized reason/message pair.
- Package version is `0.49.0`.

## Security and authority posture
This increment adds no OAuth scope, provider-write authority, browser credential access, outbound-action bypass, unsupported iMessage access, or fake production data. It does not change connected-account leases, cursor fencing, approval, policy, idempotency, reconciliation, audit, or user-controlled memory authority.

The design deliberately discards arbitrary retry executor messages rather than trying to redact them. This keeps durable owner-visible diagnostics on a small allowlisted semantic surface and prevents a later retry attempt from reintroducing data that the initial P7AE producer boundary had already removed.

## Deterministic validation target
The branch must pass the repository `Validate production core` pull-request gate, including `npm run validate` and the full deterministic Node test suite, before P7AF is marked reviewable. New retry-worker tests cover safe transient rescheduling, raw bearer/URL/email leakage rejection, unknown reason fail-closed behavior, exhausted dead-letter safety, and sanitization of unknown stored reasons.

## Review checklist
- Verify retry executor `error.message` is never persisted.
- Verify both retry-job and dead-letter paths use stable application-owned diagnostic text.
- Verify unknown stored reasons cannot become durable arbitrary text.
- Verify retry scheduling remains bounded and successful retry behavior is unchanged.
- Verify existing worker lease filters remain in place.
- Verify no provider or outbound-action authority is introduced.

## Infrastructure blockers
Not validated live in this build context: deployed retry-worker execution, real Supabase service-role persistence, owner-visible dead-letter/RLS behavior, worker crash/restart behavior, provider-driven retry failures, or logging/APM capture. No live provider, Supabase, network, or deployed-runtime success is claimed.
