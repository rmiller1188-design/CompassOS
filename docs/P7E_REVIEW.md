# P7E Review — Runtime outbound-action policy and emergency stops

## Review status

Validation pending on the exact branch head. Do not treat this milestone as reviewable until the repository validation workflow passes.

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

## Security posture

- No provider credentials or tokens are accepted by the policy module.
- No plaintext mail/calendar body is required by the policy module.
- No browser/client write authority is introduced.
- No provider call occurs in this module.
- An emergency block can only reduce execution capability; it cannot bypass approval.
- Missing/stale approval binding or stale policy state fails closed.
- No unsupported iMessage database access or fake production data is introduced.

## Deterministic validation coverage

The branch includes tests for current approved-action allowance, non-approved rejection, payload-hash mutation rejection, stale approval-revision rejection, global stop behavior, provider/account/action scope isolation, expiry behavior, future-rule handling, stale/future policy failure, policy/decision tamper detection, duplicate rules, and unsupported providers/actions.

## Infrastructure blockers

The runtime policy is not yet persisted or distributed from a configured Supabase project, and it has not been wired into a deployed service-role execution worker. No live Google or Microsoft provider action, emergency-stop incident drill, policy propagation test, browser control surface, or production audit persistence has been executed. No live provider, database, worker, or incident-response success is claimed.
