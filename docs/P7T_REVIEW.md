# P7T Review — Reconciliation provider egress confinement

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Scope

P7T closes a credential-exfiltration gap left after P7S. A purpose-bound, single-use reconciliation credential is no longer sufficient by itself to authorize an arbitrary provider HTTP destination: the production reconciliation composition now constrains the request to the exact supported provider origin, API surface, HTTP method, and redirect behavior before the underlying fetch implementation can run.

## Production changes

- Added `createReconciliationEgressFetch(...)` as a fail-closed provider egress boundary for reconciliation lookups.
- Gmail reconciliation is restricted to `https://gmail.googleapis.com/gmail/v1/users/me/messages`.
- Google Calendar reconciliation is restricted to canonical Calendar event collection/item paths under `https://www.googleapis.com/calendar/v3/calendars/.../events`.
- Microsoft mail reconciliation is restricted to the Graph sent-items message lookup surface.
- Microsoft Calendar reconciliation is restricted to the Graph `/v1.0/me/events` collection/item surface.
- Provider reconciliation traffic is HTTPS-only, GET-only, bodyless, exact-origin, and rejects URL credentials/fragments.
- Guarded requests force `redirect: error`, `credentials: omit`, and `referrerPolicy: no-referrer`.
- A bearer authorization header is required before the underlying fetch implementation is invoked.
- Unsupported provider/kind route profiles fail closed.
- The P7S purpose-bound reconciliation adapter now composes the egress guard around each Google/Microsoft mail/calendar fetch path.
- Added eight deterministic origin, path, method, body, redirect-policy, credential, URL-shape, and route-profile tests.
- Added the new production module to `npm run validate` and advanced the core package version to `0.37.0`.

## Safety invariants

- No new OAuth scopes or outbound-write authority are added.
- The raw provider bearer credential remains inside the existing single-use `withAccessToken(...)` callback.
- Purpose, action subject, provider, account, origin, path, or method drift fails closed.
- A hostile origin lookalike cannot receive the bearer credential through the guarded fetch path.
- Automatic redirect following is disabled at the application fetch boundary.
- Existing reconciliation evidence, adjudication, retry-admission, approval, runtime-policy, idempotency, and audit controls remain unchanged.
- No unsupported iMessage database access and no fake provider/database evidence are introduced.

## Verification

The implementation candidate head `ff90ccc4c8aaabf392c07f010fc1fd5ad957ed6e` passed GitHub Actions `Validate production core` run 448 after the first CI pass exposed and the branch corrected a provider-header compatibility regression. The validation gate includes production-core syntax checks and the deterministic Node test suite.

The milestone is reviewable only after the final documentation/roadmap head passes the same repository gate and the draft PR remains mergeable against exact P7S base `ec8c3006eee608193e3378bd87df3797f0c4055b`.

## Infrastructure blockers

A live Google/Microsoft provider sandbox, deployed proxy/service-mesh egress layer, and production worker network environment are not configured. Real redirect handling, DNS/TLS interception behavior, proxy rewriting, provider endpoint behavior, OAuth refresh followed by constrained reconciliation, provider throttling/fault injection, service-role Supabase execution, and the complete quarantine → refresh → purpose-bound constrained lookup → evidence → adjudication path remain unvalidated. No live provider, network, or database execution success is claimed.
