# P7L Review — Reconciliation Retry Worker

Status: VALIDATION PENDING
Date: 2026-08-08

## Objective

Turn P7K transient provider reconciliation outcomes into a bounded, service-role-only retry workflow without allowing duplicate concurrent lookups, unbounded retry storms, or any path that converts provider failure into proof of non-execution.

## Production changes

- Added a provider-neutral reconciliation retry worker around the P7K orchestration boundary.
- Added deterministic bounded exponential backoff with stable SHA-256-derived jitter.
- Honors provider Retry-After guidance up to the configured maximum delay.
- Added atomic Supabase claiming using `FOR UPDATE SKIP LOCKED` and short-lived lease tokens.
- Added service-role-only retry scheduling, lease release, and exhaustion RPCs.
- Added attempt accounting and maximum-attempt fail-closed transition to manual review.
- Context hydration drift and orchestration exceptions fail closed to manual review rather than automatic retry.
- Transient lookup exhaustion never manufactures `provider_confirmed_absence` evidence.
- Browser roles retain read-only reconciliation visibility and cannot claim, schedule, release, or exhaust retry leases.

## Safety properties

1. Only one live worker lease may own a due reconciliation case at a time.
2. A transient provider error remains `pending`; it is not evidence that the original action did not execute.
3. Retry delays are bounded and spread deterministically to reduce synchronized retry pressure.
4. Provider Retry-After guidance is respected within the configured safety ceiling.
5. Exhausted retries become `manual_review`, never an automatic resend path.
6. Invalid hydrated context or orchestration failure becomes manual review.
7. This milestone does not add provider scopes, browser write authority, or unsupported iMessage access.

## Validation target

- `npm run validate`
- production-core syntax validation including `src/actions/reconciliation-retry-worker.js`
- deterministic Node test suite including worker idle, retry, exhaustion, context-drift, orchestration-failure, terminal-release, and backoff-bound cases
- GitHub Actions validation on the exact final branch head

## Infrastructure blockers

The `20260808_reconciliation_retry_worker.sql` migration has not been applied to a configured Supabase project. Live `FOR UPDATE SKIP LOCKED` concurrency, lease-expiry recovery, multi-worker contention, provider throttling, real Retry-After behavior, OAuth refresh during retry, and a complete ambiguous execution → quarantine → reconciliation retry → evidence/adjudication flow remain unvalidated. No live database or provider success is claimed.
