# P7N Review — Provider session credential containment

## Status

Validation pending on the exact branch head. Do not merge or describe this milestone as reviewable until GitHub Actions `Validate production core` passes for the final documentation head.

## Scope

P7N tightens the runtime boundary introduced in P7M. Reconciliation still acquires OAuth access tokens server-side through the existing encrypted refresh/rotation service, but the resulting provider session no longer exposes the token as an enumerable data property.

## Production changes

- Added `src/actions/provider-session-credential.js`.
- Provider session credentials are represented by a frozen object bound to provider and connected-account identity.
- The raw `accessToken` remains directly readable for compatibility but is non-enumerable.
- Object spread therefore carries only provider/account metadata rather than the bearer credential.
- `JSON.stringify` uses an explicit safe representation containing provider, account ID, and `credential: "ephemeral"` only.
- Added a non-enumerable `withAccessToken(callback)` capability to support future migration away from direct token property access.
- Reconciliation OAuth preparation now constructs this contained session before provider orchestration.

## Security properties

- Routine structured JSON logging of the reconciliation context does not serialize the access token.
- Object spread does not copy the access token or credential callback.
- Provider/account binding remains fail-closed before OAuth acquisition.
- The session object is immutable after creation.
- No new OAuth scopes, browser credential access, provider-write authority, persistence fields, or fake production evidence were added.
- No unsupported iMessage access is introduced.

## Compatibility

Existing code that reads `providerSession.accessToken` continues to work, minimizing risk to the reconciliation adapters. New provider code can instead use `providerSession.withAccessToken(...)` to make credential use explicit.

## Deterministic validation coverage

The added tests cover:

1. non-enumerability of the raw token;
2. object-spread containment;
3. safe JSON serialization;
4. explicit callback-scoped credential access;
5. frozen session objects;
6. provider/account binding assertions;
7. reconciliation-context serialization without token leakage;
8. malformed token and malformed capability rejection.

`package.json` production validation now syntax-checks the new module before running the full Node test suite.

## Infrastructure blockers

A deployed worker/APM environment is not configured, so P7N cannot yet prove how every external logger, debugger, crash reporter, heap inspector, or APM agent treats non-enumerable properties and getters. The deterministic guarantee is limited to normal property enumeration, object spread, and JSON serialization. Live Google/Microsoft OAuth and provider reconciliation also remain blocked by provider/Supabase infrastructure described in prior milestones.

## Review checklist

- [x] Isolated feature branch from the exact P7M source head.
- [x] Server-side token acquisition preserved.
- [x] No new scopes or outbound authority.
- [x] Deterministic containment tests added.
- [x] `BUILD_ROADMAP.md` updated.
- [x] Dated progress log added.
- [ ] Exact final head passes `Validate production core`.
- [ ] Live deployed telemetry inspection completed.
