# P7M Review — Reconciliation OAuth Refresh Boundary

## Scope

P7M closes the authentication gap between P7L's reconciliation retry worker and provider-correlated lookups. A claimed reconciliation case must now obtain a valid, account-bound OAuth access token through the existing server-side OAuth application service before provider reconciliation can execute.

## Production behavior

- Exact reconciliation `userId`, `accountId`, and `provider` bindings are checked before token acquisition.
- Disconnected or `reauthorization_required` accounts fail closed to `PROVIDER_RECONNECT_REQUIRED` without a provider lookup.
- The existing `OAuthApplicationService.getValidAccessToken` path remains the single refresh/rotation authority, retaining encrypted token-envelope handling and refresh locking.
- Retryable refresh failures are routed into P7L bounded backoff and respect provider retry guidance.
- Permanent refresh failures are exhausted to reconnect/manual review; they cannot be converted into provider-confirmed absence.
- The refreshed access token is passed only in an ephemeral worker context and is not returned in worker results or written to reconciliation retry/evidence state.
- Provider reconciliation orchestration is not invoked if the OAuth session boundary fails.

## Security invariants

P7M does not add OAuth scopes, provider-write permissions, browser-visible tokens, or client-side secrets. It does not alter the explicit approval/reapproval rules from P5/P7H, and it cannot manufacture resend authority. Account/owner/provider drift fails closed before provider access.

## Deterministic validation coverage

The added tests cover account-bound token acquisition, owner/account drift, disconnected and reauthorization-required account handling, transient refresh retry scheduling with Retry-After, permanent refresh reconnect routing, ephemeral token handoff, retry-ceiling exhaustion, and classification separation between retryable refresh and reconnect conditions.

Repository validation also syntax-checks the new production module before running the complete deterministic Node test suite. The authoritative final validation status is the GitHub Actions result attached to PR #38's final documentation head.

## Infrastructure blockers

No configured Google or Microsoft provider credentials, live token rotation/revocation scenario, Supabase service-role worker, or provider sandbox is available in this build environment. Therefore live refresh-token rotation, revoked-consent recovery, provider lookup after refresh, multi-worker refresh contention, and the complete quarantine → refresh → provider lookup → evidence → adjudication flow remain unvalidated.

No live provider, database, or deployed-worker success is claimed.
