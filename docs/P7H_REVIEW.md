# P7H Review — Manual Reconciliation Adjudication and Retry Admission

Status: validation pending on the exact final branch head.

## Purpose

P7G intentionally quarantines outbound mail/calendar executions when the provider may already have completed the action but Compass cannot prove the terminal outcome. P7H adds the production safety boundary for human adjudication and any subsequent retry attempt. The design does not allow an uncertain human judgment by itself to trigger resend.

## Included

- deterministic adjudication records bound to action, user, connected account, payload hash/revision, prior approval revision, prior idempotency-key digest, reviewer, evidence, and review time
- explicit outcomes: confirmed success, closed with no retry, and retry eligible
- confirmed success requires a provider receipt identifier
- retry eligibility requires `provider_confirmed_absence` evidence and a concrete evidence reference
- retry grants expire after a short bounded TTL
- retry admission requires the exact reconciled payload, a newer explicit approval revision, a valid approved-payload binding, and a newly derived idempotency key
- deterministic adjudication SHA-256 integrity verification
- service-role-only persistence with owner-readable RLS
- atomic PostgreSQL retry-grant consumption with row locking and replay prevention
- deterministic tests for integrity, evidence quality, success receipts, fresh approval, payload mutation, idempotency rotation, grant expiry, and no-retry decisions

## Security posture

- ambiguous provider execution remains non-retryable by default
- manual review cannot authorize retry without provider-confirmed absence evidence
- retry requires a second explicit approval newer than the approval associated with the ambiguous execution
- the old idempotency key cannot be reused
- retry grants are short-lived and single-use at the database boundary
- browser clients cannot insert, modify, delete, or consume adjudication grants
- provider credentials and token material are not part of the adjudication record
- no unsupported iMessage access and no fake production evidence

## Validation target

The strongest available repository validation is `npm run validate`, which syntax-checks the production modules and executes the complete Node test suite. This artifact must not be marked reviewable until GitHub Actions passes on the exact final branch head.

## Infrastructure blockers

The new Supabase migration has not been applied to a configured project. No live service-role adjudication flow, database row-lock/replay test, provider-side absence lookup, fresh-approval UI path, provider sandbox resend, or manual-review UX is available. No live database or provider retry success is claimed.
