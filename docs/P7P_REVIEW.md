# P7P Review — Capability-only provider credential boundary

Status: REVIEWABLE CORE / LIVE VALIDATION BLOCKED

## Scope

P7P removes the remaining ambient provider access-token getter introduced for P7N compatibility. Provider credentials are now available only through the explicit `withAccessToken` capability, and provider-session assertions reject legacy session objects that expose an `accessToken` property.

The capability also performs bounded deterministic escape inspection after callback completion. If a callback returns the raw token directly or nested in arrays, plain objects, maps, or sets, the boundary rejects the result with `PROVIDER_CREDENTIAL_ESCAPE_BLOCKED`. If a callback throws an error containing the credential in its message, stack, or cause, the secret-bearing error is replaced with the same non-secret boundary error. Ordinary non-secret provider failures are preserved so existing retry/error classification remains usable.

## Security properties

- No `providerSession.accessToken` getter or direct token property exists.
- Object spread and JSON serialization cannot obtain the access token.
- Session assertions require `credentialMode: capability-only` and reject ambient token properties.
- Telemetry only grants special contained-session treatment to capability-only sessions with no ambient token property.
- Credential callbacks cannot return common JSON/collection structures containing the exact token.
- Secret-bearing callback errors are replaced rather than chained as causes, avoiding direct secret retention in the boundary error.
- No OAuth scope, provider-write permission, browser execution authority, or database privilege is added.

## Validation

GitHub Actions `Validate production core` run 397 passed on implementation head `0a23cc6751ab00522dfe52bb3df459babd802409` through PR merge validation against P7O. The repository gate ran production-core syntax checks under Node 22.23.1 and completed 227/227 deterministic tests with zero failures.

The final documentation/status head must also remain green before this review artifact is surfaced as a completed milestone.

## Known limits / live blockers

This application boundary cannot prevent a deliberately malicious callback from copying a token into an external closure, native memory, or privileged debugger. Live Google/Microsoft provider adapters and deployed worker/APM instrumentation are not configured, so no live credential-use or process-memory claim is made. Existing Supabase/provider infrastructure blockers remain unchanged.
