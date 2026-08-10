# P7AB — Long-running sync lease heartbeat integration

## Disposition

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED.**

P7AA prevented overlapping scheduler workers from starting the same connected account concurrently, but an account lease could still expire during a long mail/calendar/contacts run. P7AB carries rotating heartbeat ownership through the production sync coordinator and page-processing boundary so cursor/data persistence does not continue after ownership can no longer be proven.

## Production changes

- Unified sync composition now requires `acquire`, `heartbeat`, and `release` on any resolved account lease manager.
- The coordinator renews the account lease before each requested resource, updates the in-memory lease to the newest rotating token, and releases that latest generation.
- Default mail, calendar, and contacts incremental runners receive a narrow `heartbeatLease` capability and renew immediately after each provider page fetch, before normalized records or the page checkpoint can be persisted.
- Heartbeat backend failures and lost/expired ownership are normalized as sanitized retryable sync-control failures.
- A lease-control failure blocks later resources for only the affected account. Other connected accounts remain eligible to continue.
- Failed post-fetch renewal prevents that page from saving its cursor, reducing stale-worker cursor advancement risk.

## Safety posture

P7AB does not add provider write authority, OAuth scopes, browser credential handling, unsupported iMessage access, or fake production data. It does not weaken Supabase RLS, account-bound persistence, approval/audit boundaries, or user-controlled memory. Lease renewal remains server/service-role infrastructure and is bound to the exact account/provider/worker/token established by P7AA.

The design intentionally does not use an ambient timer. Renewal occurs at explicit coordinator/resource/page boundaries, making ownership checks deterministic and reviewable. A single provider page request that stalls beyond the lease duration is detected only after the request returns; P7AB then fails before normalized data or cursor persistence for that page. Cancellation of an in-flight provider request remains a separate infrastructure/runtime concern.

## Deterministic validation

Coverage includes rotating heartbeat tokens, release of the refreshed token, heartbeat backend/loss sanitization, fail-closed lease-manager composition, post-fetch cursor non-advancement on renewal failure, and remaining-resource suppression for the affected account. Package version is `0.45.0` and all changed production modules are in the existing `npm run validate` syntax chain.

GitHub Actions `Validate production core` run **542** passed implementation/documentation candidate head `7163f8a5c819264f14afd0814b136be5ec200d2d` through PR merge validation against exact P7AA base `cc0c86adb458ae8a3a22802385cbb40be84b1260`. The workflow used Node **22.23.1**, completed the production-core syntax chain, and passed **291/291 deterministic tests with zero failures**. The P7AB lease suite occupies tests 1–13, including the new rotating-heartbeat and cursor-safety cases.

This review artifact update creates a documentation-only final head; that exact final head must pass the same production validation gate before milestone notification.

## Infrastructure blockers

The Supabase lease migration remains unapplied in this build context. Live service-role RLS/RPC authorization, heartbeat token rotation against Supabase, provider requests exceeding lease duration, scheduler crash/restart recovery, multi-worker contention, network cancellation, and durable cursor progression require configured external infrastructure. No live Google, Microsoft, Supabase, network, or deployed scheduler success is claimed.
