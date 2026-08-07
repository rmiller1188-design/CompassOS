# P7F Review — Policy-Enforced Execution Worker

## Status

**REVIEWABLE CORE MILESTONE / LIVE VALIDATION BLOCKED.** GitHub Actions `Validate production core` run 260 passed on the implementation head. The final documentation-only head is required to pass the same workflow before milestone notification. Live Supabase and provider execution remain infrastructure-blocked.

## Scope

P7F closes the gap between the P7E runtime emergency policy and the P6 action queue. The service-role execution boundary now requires an atomically leased action, exact persisted approval binding, a current untampered runtime-policy allow decision, successful decision persistence, current provider write consent, unchanged approved payload, and idempotency verification before any provider adapter may execute.

## Production changes

- Added `src/actions/policy-enforced-worker.js`.
- Added PostgreSQL approval-binding migration `20260807_policy_execution_binding.sql`.
- Approval transition binds `approved_payload_hash` and `approval_payload_revision` to the exact payload revision.
- Approved/executing payload mutation is rejected in PostgreSQL.
- Executing state requires the persisted approval binding to remain exact.
- Runtime policy is evaluated only after lease/context consistency checks.
- The policy decision must be recorded before a provider call; audit persistence failure fails closed.
- Emergency-policy blocks move the claimed action to failed without touching the provider.
- Mail/calendar write consent and payload integrity are rechecked at the worker boundary.
- Existing idempotency receipts short-circuit duplicate provider execution.
- Terminal transition metadata carries `policyDecisionHash` for audit correlation.

## Security posture

- No browser execution authority is introduced.
- No new OAuth scopes are introduced.
- Provider tokens remain behind the existing server-side adapter/token-resolver boundary.
- Policy evaluation receives identifiers, hashes, revisions, provider, and action type; it does not require message/calendar body content.
- Missing approval binding, stale policy, emergency blocks, audit persistence failure, consent failure, payload drift, lease drift, and adapter absence all fail closed.
- No unsupported iMessage access and no fake production-path data.

## Deterministic validation coverage

`test/policy-enforced-worker.test.js` covers normal allowed execution, emergency-stop blocking, fail-closed policy-decision persistence, stale approval revisions, idempotent receipt reuse, and execution-context drift from the lease. `npm run validate` also syntax-checks the worker and runs the complete production-core Node test suite.

## Infrastructure blockers

The new migration has not been applied to a configured Supabase project. No live service-role queue worker, database trigger/RLS pass, provider sandbox action, policy distribution service, or incident-control surface was available in this build environment. No live database or provider success is claimed.
