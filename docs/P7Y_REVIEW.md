# P7Y Review — Unified multi-account sync coordinator

## Status

REVIEWABLE CORE / LIVE VALIDATION BLOCKED once the exact final branch head passes the repository production-core validation gate.

## Objective

Move Compass from individually callable provider sync primitives toward the actual command-center operating model: multiple Gmail/Google accounts and Microsoft 365 accounts can be coordinated through one provider-neutral sync pass for mail, calendar, and contacts without allowing one account failure to stop the rest.

## Included

- `src/sync/unified-sync-coordinator.js`
- Google and Microsoft connected-account validation
- mail, calendar, and contacts resource orchestration
- one adapter resolution per active account
- deterministic account ordering
- inactive-account skip before provider work
- duplicate-account and unsupported-provider fail-closed checks
- resource allowlist and de-duplication
- account-level fault isolation
- reauthorization short-circuit limited to the affected account
- sanitized coordinator failure summaries without raw provider error messages
- existing incremental runners reused rather than bypassed
- package version 0.42.0 and production validation inclusion
- deterministic unit coverage

## Safety posture

This milestone adds no OAuth scopes, token storage, browser credential authority, provider write authority, approval bypass, unsupported message source, or fake production data. It only orchestrates the existing read-side incremental mail/calendar/contacts runners. Outbound mail/calendar actions remain governed by the existing explicit approval, policy, idempotency, reconciliation, and audit boundaries.

## Validation target

The reviewable head must pass the repository `Validate production core` GitHub Actions gate, including syntax validation and the complete deterministic Node test suite. Exact head SHA, run number, Node version, and final pass counts should be recorded in the PR after CI completes.

## Live-validation blockers

No live multi-account Google/Microsoft OAuth environment, Supabase service-role persistence environment, provider throttle/fault-injection harness, or deployed sync scheduler is available. Therefore this milestone does not claim live account fanout, live token refresh, live cursor advancement, scheduler concurrency, or production database execution.

## Review focus

Review account isolation, reauthorization behavior, adapter-resolution failure handling, result-envelope sanitization, resource ordering, and whether the coordinator remains a thin composition layer over the already validated incremental sync primitives.