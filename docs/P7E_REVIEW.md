# P7E Review — Runtime outbound-action policy and emergency stops

## Review status

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED.** GitHub Actions `Validate production core` run 242 passed after the code fix on head `cdb44ee3f951973232f9f7f14a6b0d7fd7fe9396`. The final documentation-only head must also pass the repository workflow before the PR status is updated to exact-head validated.

## Purpose

P7E adds a final server-side policy gate immediately before an already-approved outbound mail or calendar action may execute. The policy is intentionally provider-neutral and fail-closed. It does not create a new execution path, provider scope, or browser-side authority.

## Production behavior

- Runtime policy snapshots are immutable and SHA-256 bound.
- Only Google and Microsoft provider actions already supported by Compass are accepted.
- Only reply and supported calendar mutation action types are accepted.
- An action must still be in `approved` state.
- Approval must bind to the exact current payload hash and payload revision.
- A stale or future-dated policy snapshot blocks execution.
- Active emergency rules may block globally, by provider, by connected account, or by exact action type.
- Block rules may expire automatically and cannot activate before their creation timestamp.
- Every policy decision is deterministically hashed for audit/evidence use.
- Policy or decision mutation is detectable.

## Validation hardening discovered during this pass

The full repository suite exposed a release-promotion integrity gap outside the new P7E module. A caller could mutate a release-candidate field while retaining the old `candidateHash`; the candidate-integrity check failed, but an approval bearing that retained hash was still considered current and could satisfy the approval threshold. The promotion evaluator now invalidates all current approvals whenever candidate manifest integrity fails. This preserves the intended invariant that candidate mutation invalidates prior approval.

## Security posture

- No provider credentials or tokens are accepted by the policy module.
- No plaintext mail/calendar body is required by the policy module.
- No browser/client write authority is introduced.
- No provider call occurs in this module.
- An emergency block can only reduce execution capability; it cannot bypass approval.
- Missing/stale approval binding or stale policy state fails closed.
- Tampered release candidates cannot retain effective prior promotion approval.
- No unsupported iMessage database access or fake production data is introduced.

## Deterministic validation coverage

The branch includes tests for current approved-action allowance, non-approved rejection, payload-hash mutation rejection, stale approval-revision rejection, global stop behavior, provider/account/action scope isolation, expiry behavior, future-rule handling, stale/future policy failure, policy/decision tamper detection, duplicate rules, unsupported providers/actions, and release-candidate mutation invalidation.

## Infrastructure blockers

The runtime policy is not yet persisted or distributed from a configured Supabase project, and it has not been wired into a deployed service-role execution worker. No live Google or Microsoft provider action, emergency-stop incident drill, policy propagation test, browser control surface, or production audit persistence has been executed. No live provider, database, worker, or incident-response success is claimed.