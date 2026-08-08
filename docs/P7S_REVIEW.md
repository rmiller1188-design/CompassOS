# P7S Review — Purpose-bound reconciliation provider adapters

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Scope

P7S closes the adapter-consumption gap left after P7R. Reconciliation OAuth credentials are no longer merely purpose-bound at session preparation: the production-safe provider reconciliation composition now requires that exact `reconciliation.lookup` capability, bound to the claimed action id, provider, and connected account, before Gmail, Microsoft mail, Google Calendar, or Microsoft Calendar HTTP lookup execution.

## Production changes

- Added `createPurposeBoundProviderReconciliationLookup(...)` as the production-safe reconciliation composition boundary.
- Exact `reconciliation.lookup` purpose and reconciliation action-id subject are asserted before provider HTTP execution.
- Provider and connected-account identity must match the purpose-bound session exactly.
- The raw access token remains inside the existing single-use `withAccessToken(...)` callback and is injected only into the existing low-level provider request adapter for that one operation.
- No raw token is returned from the capability callback or persisted into reconciliation outcomes/evidence.
- Successful execution consumes the credential capability; replay is rejected by the existing P7Q single-use boundary.
- Google/Microsoft mail and calendar routes share the same exact capability enforcement.
- Added deterministic success, purpose drift, action-subject drift, account drift, replay, token non-disclosure, and calendar-routing tests.
- Added the new production module to `npm run validate`.

## Safety invariants

- No OAuth scopes or outbound-write authority are added.
- No ambient access-token property is reintroduced.
- Purpose, subject, provider, or account drift fails closed before provider HTTP execution.
- Provider outcomes continue to use existing reconciliation evidence/adjudication rules; this milestone does not authorize retries or outbound actions.
- No unsupported iMessage database access and no fake provider/database evidence are introduced.

## Verification

Implementation candidate head `708982e06250a40d715a53b614e3dab8e8fec84e` passed GitHub Actions `Validate production core` run 435 through PR merge validation against exact P7R base `cb1bf7de025082489f2bdf68ac160acad46238b2`. The workflow used Node 22.23.1, completed production-core syntax checks, and ran 240 deterministic tests: 240 passed, 0 failed.

The milestone is reviewable only after the final documentation/roadmap head also passes the same repository gate.

## Infrastructure blockers

No configured live Google or Microsoft provider sandbox is available. Live OAuth refresh/rotation followed by purpose-bound Gmail/Graph/Calendar reconciliation, provider throttling/fault injection, service-role Supabase execution, and the complete quarantine → refresh → purpose-bound lookup → evidence → adjudication flow remain unvalidated. No live provider or database execution success is claimed.
