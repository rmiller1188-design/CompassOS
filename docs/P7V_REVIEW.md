# P7V Review — Reconciliation Provider Error Semantics

## Review status

Reviewable core. Live provider and Supabase validation remains blocked by unavailable infrastructure/credentials.

Base: P7U `72008dcf26e3ae6b90cc487598320955b61a43ed`

## Production increment

P7V adds a narrow provider-error trust boundary to the purpose-bound reconciliation path. P7U already constrained request egress and successful response decoding; P7V prevents accepted non-2xx provider JSON from carrying arbitrary provider body messages into orchestration, retry state, worker output, or diagnostics.

### Added

- `src/actions/reconciliation-provider-errors.js`
  - stable application error codes for authentication, rate limits, transient HTTP failures, and rejected requests;
  - bounded provider-code metadata;
  - bounded `Retry-After` parsing utility with delta-seconds and HTTP-date support;
  - preservation of P7U egress/response boundary errors and network transport errors;
  - classification helper aligned to the existing retry/manual-review dispositions.
- `src/actions/purpose-bound-reconciliation-adapters.js`
  - normalizes provider failures before they leave the single-use purpose-bound capability boundary.
- `test/reconciliation-provider-errors.test.js`
  - deterministic 401, 429, 408/425, non-transient 4xx, boundary-preservation, leakage, and `Retry-After` coverage.
- package version `0.39.0` and production validation inclusion.

## Safety properties

- Provider-supplied error message text is not trusted as an application error message on the canonical purpose-bound reconciliation path.
- A 401/403 becomes reconnect/manual review; it cannot become absence evidence.
- A 429 or transient HTTP/network failure remains retry-only and cannot become provider-confirmed absence.
- Non-transient 4xx failures fail closed to manual review.
- Retry metadata is capped to the existing 15-minute retry ceiling.
- P7U response/egress failures remain distinct and are not reclassified as ordinary provider errors.
- Existing single-use credential, purpose/action/account binding, approval, audit, evidence, idempotency, and resend safeguards are unchanged.

## Validation evidence

GitHub Actions `Validate production core` run 472 passed on implementation/package head `7bf84d57a961a7d9677e71b18aa7544bc8c51cdc` using Node 22.23.1. The gate completed production-core syntax validation and 261/261 deterministic tests with zero failures.

The documentation head must also pass the repository gate before the milestone is declared reviewable in the PR/final build report.

## Infrastructure blockers

No live success is claimed for Google or Microsoft provider error payloads, HTTP-date `Retry-After` propagation through the current provider adapter, real throttling, revoked-consent/reconnect behavior, network/proxy transformations, or service-role Supabase reconciliation execution. Those require configured live provider and database infrastructure.
