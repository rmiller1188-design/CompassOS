# P7O Review — Telemetry-safe worker diagnostics boundary

## Status

REVIEWABLE CORE / LIVE VALIDATION BLOCKED. The reviewable branch must retain a passing `Validate production core` check on the exact final documentation head. The implementation/documentation candidate passed GitHub Actions run 380 with 225/225 deterministic tests and production-core syntax validation under Node 22.23.1; final-head validation is the release gate for this artifact.

## Objective

Close the application-side observability gap left after P7N. Provider access tokens were already contained in non-enumerable session properties, but production workers still need an explicit diagnostics boundary so ordinary structured logging, error reporting, and telemetry envelopes do not accidentally serialize credentials or raw connected-account identifiers.

## Production changes

- Added `src/operations/telemetry-safety.js`.
- `sanitizeTelemetry` recursively sanitizes application telemetry without invoking provider-session token getters or `withAccessToken` capabilities.
- Secret-bearing property names are replaced with `[REDACTED]` before their values are traversed.
- Bearer strings, JWT-like strings, and OAuth query parameters (`access_token`, `refresh_token`, `id_token`, `code`, `client_secret`) are redacted in free-form diagnostic text.
- Contained provider sessions become `{ provider, accountRef, credential: 'ephemeral' }`; raw account IDs and access tokens are omitted.
- `telemetryAccountRef` derives deterministic SHA-256 pseudonymous account references for operational correlation without emitting the source account identifier.
- Circular structures, excessive nesting, and oversized strings are bounded deterministically.
- Error serialization uses a small allowlist (`name`, `message`, `code`, `status`, `retryAfter`) instead of copying arbitrary enumerable error properties.
- `createWorkerTelemetryEvent` creates an explicit, frozen telemetry envelope for worker events with safe provider/account metadata.
- `npm run validate` syntax-checks the telemetry boundary before running the complete deterministic test suite.

## Deterministic coverage

`test/telemetry-safety.test.js` covers:

- secret-key redaction
- bearer/JWT/OAuth-query redaction
- provider-session serialization without credential exposure
- proof that a non-enumerable access-token getter is not read
- conservative Error serialization
- circular-reference handling
- depth and string-size limits
- worker event serialization without raw account IDs/access tokens
- malformed/uncontained provider-session rejection
- deterministic pseudonymous account references

## Security posture

This milestone does not add provider scopes, execution authority, or client-side credentials. The sanitizer never needs the raw access token and never invokes `withAccessToken`. Raw connected-account IDs are excluded from the worker telemetry envelope in favor of a one-way operational reference. Existing P7M refresh/rotation and P7N credential containment remain unchanged.

The implementation does not claim that JavaScript application controls can prevent a privileged native debugger, heap inspector, process-memory dump, or third-party APM agent with invasive runtime instrumentation from observing process memory. That requires deployed-environment validation and vendor-specific controls.

## Validation evidence

- GitHub Actions workflow: `Validate production core`
- Candidate run 380: success
- Candidate deterministic suite: 225 passed, 0 failed
- Candidate production-core syntax validation: passed
- Application runtime used by validation: Node 22.23.1
- Exact final documentation-head GitHub check: required to remain green before this milestone is treated as reviewable

## Infrastructure blockers

- no deployed worker environment for structured-log inspection
- no configured APM/crash-reporting integration for redaction verification
- no live provider OAuth/reconciliation workload to generate production telemetry
- no configured Supabase service-role worker environment

No live provider, database, deployed-worker, or third-party telemetry success is claimed.
