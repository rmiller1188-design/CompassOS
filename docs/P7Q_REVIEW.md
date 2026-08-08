# P7Q Review — Single-use expiring provider credential capabilities

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Scope

P7Q tightens the P7P capability-only provider credential boundary so one OAuth access-token acquisition grants at most one provider callback opportunity. The capability is short-lived and is consumed before provider code executes.

## Production changes

- Provider sessions declare `credentialMode: capability-only` and `capabilityUseMode: single-use`.
- `withAccessToken(...)` is consumed atomically in-process before the callback receives the credential.
- A second or concurrent use fails with `PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED`.
- The default capability TTL is 120 seconds; an expired capability fails with `PROVIDER_CREDENTIAL_CAPABILITY_EXPIRED` before provider code can execute.
- Callback failure, cancellation-by-throw, or credential-escape detection does not restore capability reuse.
- Existing credential-escape detection continues to reject raw token material returned or thrown through nested objects, arrays, maps, sets, and errors.
- Telemetry only treats capability-only, single-use sessions as trusted provider-session envelopes and still emits pseudonymous account references rather than raw account IDs.

## Safety invariants

- No ambient `accessToken` property exists on provider sessions.
- No browser/client credential authority is added.
- No OAuth scopes or provider-write permissions are added.
- A worker retry requires a newly prepared provider session rather than reusing a prior credential capability.
- Provider errors cannot manufacture reconciliation absence evidence or outbound resend authority.
- Existing explicit approval, policy, idempotency, reconciliation, and audit controls remain unchanged.

## Verification

The implementation candidate at `8bf69d8c4146a2d60f061fc13ba3bb7381f3352c` passed GitHub Actions `Validate production core` run 410. The workflow used Node 22.23.1, completed production-core syntax checks, and ran 230 deterministic tests: 230 passed, 0 failed.

The milestone is considered reviewable only while the latest PR head also has a green `Validate production core` result; GitHub PR checks are the final source of truth after documentation commits.

## Infrastructure blockers

No configured live Google or Microsoft provider adapter is available for credential TTL/replay fault injection. Live OAuth refresh/rotation, service-role Supabase execution, provider-side reconciliation, deployed worker tracing/APM, privileged process inspection, and the complete live reconciliation path remain unvalidated. This milestone makes no claim of live provider or database execution success.
