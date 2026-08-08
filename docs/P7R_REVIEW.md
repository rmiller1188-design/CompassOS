# P7R Review — Purpose-bound reconciliation provider capabilities

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Scope

P7R adds an application-level purpose-binding layer on top of P7Q's contained, single-use, expiring provider credential capability. Reconciliation OAuth sessions are minted for the exact `reconciliation.lookup` purpose and the claimed outbound action id, reducing accidental credential reuse across unrelated worker contexts.

## Production changes

- Added an immutable purpose-bound provider-session wrapper around the existing contained credential session.
- Reconciliation session preparation binds the provider session to `reconciliation.lookup` and the reconciliation action id after user/account/provider validation and OAuth access-token acquisition.
- Provider/account identity remains explicit while purpose and action-subject metadata are non-enumerable and omitted from the provider-session JSON representation.
- Added fail-closed assertions for purpose, subject, provider, and account drift.
- Preserved P7Q's single-use `withAccessToken(...)` interface, expiry behavior, credential-escape checks, and serialization boundary.
- Added deterministic purpose-binding, serialization, drift, invalid-wrapper, and single-use tests.
- Added the new production module to `npm run validate`.

## Safety invariants

- No ambient `accessToken` property is added.
- No OAuth scope or provider-write authority is added.
- The purpose wrapper does not persist the bearer credential or expose the bound action subject through routine provider-session serialization.
- Existing explicit approval, runtime policy, idempotency, reconciliation, retry-admission, and audit controls remain unchanged.
- Purpose binding is an in-process application boundary, not a claim of cryptographic isolation from malicious code already executing inside the trusted worker process.

## Verification

The implementation candidate at `53782521ac1401b36b62741efd726caf550626e6` passed GitHub Actions `Validate production core` run 424 through PR merge validation against exact P7Q base `09d8f5c40186b1fb1c5f62a9538c7294e326f24a`. The workflow used Node 22.23.1, completed production-core syntax checks, and ran 234 deterministic tests: 234 passed, 0 failed.

The milestone is reviewable only while the final documentation/roadmap branch head also has a green `Validate production core` result.

## Infrastructure blockers

No configured live Google or Microsoft provider adapter is available to verify adapter consumption of the exact purpose/action binding. Live OAuth refresh/rotation, service-role Supabase execution, deployed worker tracing/APM, provider reconciliation, and the complete quarantine → refresh → lookup → evidence → adjudication path remain unvalidated. No live provider or database execution success is claimed.
