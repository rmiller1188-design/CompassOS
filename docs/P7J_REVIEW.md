# P7J Review — Calendar-correlated reconciliation lookups

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Scope

P7J extends the P7G–P7I ambiguous-execution safety path to Google Calendar and Microsoft 365 calendar writes. The objective is to determine, after an uncertain provider outcome, whether a calendar mutation is provably present without blindly replaying an approved write.

## Production behavior

- Google calendar create, update, and attendee-response mutations carry a SHA-256-derived private extended-property marker in the same provider mutation.
- Microsoft calendar create and update mutations carry a SHA-256-derived single-value extended property in the same Graph mutation.
- Google creates are reconciled by exact private extended-property search; Microsoft creates are reconciled by exact extended-property search.
- Duplicate create matches are `unknown`, never success.
- Successful zero-match create queries may return `not_found`; provider errors never become absence evidence.
- Known-event Google updates/responses and Microsoft updates require exact correlation on the target event.
- A missing event for an update/response is `unknown`, because deletion or later mutation is not proof that the original write never occurred.
- Microsoft attendee responses are reconciled by the resulting provider response state. A mismatch remains `unknown` and cannot authorize retry.
- Mail and calendar reconciliation adapters are selected independently by action type.

## Security and privacy

- Raw idempotency keys are not persisted in provider correlation evidence.
- Provider correlation uses a one-way SHA-256 digest.
- Provider access tokens remain server-side and are sent only in authorization headers.
- Query URLs contain only correlation digests or provider resource identifiers, never provider tokens or raw idempotency keys.
- Retry remains governed by P7H: only provider-confirmed absence evidence, a fresh explicit approval, unchanged payload, and a new idempotency key can admit another write.

## Validation

GitHub Actions `Validate production core` run 313 passed on implementation head `05151a4a7ed6b27b5a7d582c091300ccc2b8ab75`.

Repository validation completed:

- production-core syntax checks: passed
- Node test suite: **184 passed / 0 failed**
- new P7J deterministic cases: provider stamping, create lookup, duplicate-match rejection, missing-resource fail-closed behavior, Microsoft response desired-state reconciliation, action-type routing, and provider-error propagation

A final exact-head validation is required after the review artifact, roadmap, and progress log are committed before this milestone is reported as reviewable.

## Infrastructure blockers

The following were not validated live:

- Google Calendar private extended-property persistence and exact search behavior
- Microsoft Graph event single-value extended-property persistence and filtering
- Microsoft attendee-response state convergence after an ambiguous response call
- OAuth token refresh during a reconciliation lookup
- provider throttling, network fault injection, and post-write response loss
- service-role reconciliation against a configured Supabase project
- a complete ambiguous calendar execution → quarantine → provider lookup → adjudication/retry drill

No live Google Calendar, Microsoft Graph, Supabase, or end-to-end reconciliation success is claimed.

## Review focus

Reviewers should pay particular attention to the distinction between create and mutation absence evidence. P7J intentionally permits `not_found` only for a successful zero-match create correlation query. Missing or mismatched state on an existing-event update/response remains `unknown` to prevent unsafe retry admission.
