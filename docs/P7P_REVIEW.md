# P7P Review — Capability-only provider credential boundary

Status: VALIDATION PENDING

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

## Validation target

Repository gate: `npm run validate`, including production-core syntax checks and the complete deterministic Node test suite. P7P adds coverage for ambient-token absence, safe serialization, direct and nested credential escape, map/set escape, thrown-secret replacement, preservation of ordinary provider errors, legacy-session rejection, and reconciliation context containment.

The milestone is not reviewable until GitHub Actions passes on the exact final implementation/documentation head.

## Known limits / live blockers

This application boundary cannot prevent a deliberately malicious callback from copying a token into an external closure, native memory, or privileged debugger. Live Google/Microsoft provider adapters and deployed worker/APM instrumentation are not configured, so no live credential-use or process-memory claim is made. Existing Supabase/provider infrastructure blockers remain unchanged.
