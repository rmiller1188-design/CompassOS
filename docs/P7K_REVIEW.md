# P7K Review — Reconciliation orchestration and evidence handoff

## Status

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED.** GitHub Actions `Validate production core` run 327 passed the P7K source merged against the P7J base with 192/192 deterministic tests and zero failures plus production-core syntax checks. This documentation-final head must also pass repository validation before the reviewable claim is considered final. Live Supabase/provider validation remains blocked by unavailable configured infrastructure.

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

## Validation

GitHub Actions run 327 executed Node 22.23.1 and `npm run validate` against the P7K/P7J PR merge. The command completed all production-core syntax checks and 192/192 tests with zero failures, zero cancellations, and zero skips. A subsequent run on the documentation-final head is required before final milestone notification.

## Infrastructure blockers

The new evidence migration has not been applied to a configured Supabase project. Live RLS/service-role evidence persistence, Gmail/Microsoft/Google Calendar provider lookups, token refresh during reconciliation, provider throttling/fault injection, and a complete quarantine → lookup → evidence → adjudication → fresh approval → retry drill remain unvalidated. No live provider or database reconciliation success is claimed.