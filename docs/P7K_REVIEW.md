# P7K Review — Reconciliation orchestration and evidence handoff

## Status

Core implementation complete. Reviewable status requires repository validation on the exact final branch head. Live Supabase/provider validation remains blocked by unavailable configured infrastructure.

## Problem closed

P7G–P7J established ambiguous-execution quarantine, provider-correlated lookups, and guarded manual retry admission. One integration gap remained: a provider-confirmed zero-match could be treated as a terminal failed reconciliation even though P7H requires preserved `provider_confirmed_absence` evidence plus a newer explicit approval before any retry. P7K makes that handoff explicit and fail-closed.

## Included

- provider-neutral reconciliation orchestration for mail and calendar lookup adapters
- exact action/user/account/provider/action-type/payload binding before any provider lookup
- deterministic SHA-256 provider-observation evidence records
- provider-confirmed absence is retained as `manual_review`, never direct retry authority
- adjudication input exposes only the immutable absence-evidence reference
- transient 429/5xx/network lookup failures remain pending for a later lookup
- 401/403 lookup failures route to reconnect/manual review without manufacturing absence evidence
- provider success requires a concrete provider receipt id before terminal success
- unknown/duplicate/correlation-mismatch outcomes remain manual review and are not retry eligible
- service-role-only Supabase evidence writes with owner-readable RLS
- deterministic tests for absence handoff, success, unknown outcomes, transient errors, auth errors, context drift, evidence hashing, and error classification

## Security and privacy posture

- no provider access or refresh tokens are accepted by or persisted from the orchestrator
- evidence is tenant-bound by `user_id`, account, action, payload hash/revision, approval revision, and idempotency-key digest
- raw idempotency keys are not persisted
- browser roles receive read-only access to their own evidence rows; writes are reserved for service-role workers
- a provider query failure can never be converted into provider-confirmed absence
- absence evidence alone cannot resend anything; P7H still requires manual adjudication, unchanged payload, a newer explicit approval, a new idempotency key, and atomic single-use retry-grant consumption

## Validation target

`npm run validate` must pass on the exact final branch head. The validation command performs syntax checks across the production core and executes the complete deterministic Node test suite.

## Infrastructure blockers

The new evidence migration has not been applied to a configured Supabase project. Live RLS/service-role evidence persistence, Gmail/Microsoft/Google Calendar provider lookups, token refresh during reconciliation, provider throttling/fault injection, and a complete quarantine → lookup → evidence → adjudication → fresh approval → retry drill remain unvalidated. No live provider or database reconciliation success is claimed.
