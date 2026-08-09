# P7Z Review — Account-bound multi-account sync persistence

## Status

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

P7Z narrows the P7Y multi-account synchronization composition so persistence is resolved and bound independently for each active Google or Microsoft connected account before mail, calendar, or contacts runners execute.

## Production problem closed

P7Y correctly isolated provider adapter execution by account, but its coordinator still accepted one shared `store`. The existing Supabase sync store is itself constructed for one user/account boundary, so carrying a shared store through multi-account fanout created an avoidable composition hazard even though lower layers also check account IDs.

P7Z removes that shared-store contract from the coordinator.

## Included

- `resolveStore(account)` is required alongside `resolveAdapter(account)`.
- Every resolved raw store is wrapped in an immutable account/provider scope before a resource runner receives it.
- Account-scoped store methods reject a mismatched account ID before invoking the underlying persistence implementation.
- The exact same raw store object cannot be reused for multiple active accounts within one coordinator run.
- Inactive accounts are skipped before adapter or store resolution.
- Adapter and store-resolution failures remain isolated to one account and their raw diagnostic messages are excluded from coordinator results.
- Existing resource de-duplication, bounded page limits, reauthorization short-circuiting, retry classification, and account failure isolation are preserved.
- Package version is `0.43.0`; `src/sync/account-bound-store.js` is part of `npm run validate`.

## Security and tenancy boundary

This is an application-layer defense in depth boundary. It does not replace Supabase RLS or the account checks already present in the concrete Supabase store. It prevents the multi-account coordinator from handing a single unscoped persistence object across account work and makes cross-account misuse fail before a wrapped store method can reach its underlying implementation.

No OAuth scopes, provider-write authority, browser credential authority, outbound approval bypass, unsupported iMessage access, or fake production data were added.

## Deterministic validation

Implementation candidate `8b78cbb710bc04921494c9eeacb9179329ee4f5e` passed GitHub Actions `Validate production core` run 507 through PR merge validation against the P7Y base. The job used Node 22.23.1, completed the production-core syntax chain, and passed 278/278 deterministic tests with zero failures. The account-bound coordinator test file contains 12 passing cases, including new exact-store-scope, cross-account-call rejection, raw-store reuse rejection, and store-resolution isolation coverage.

The final documentation/roadmap branch head must also have a green PR validation check before this milestone is treated as reviewable; use the PR checks as the exact-head validation record.

## Review focus

Review the new `src/sync/account-bound-store.js` boundary first, then the coordinator's `resolveStore` composition. The key invariant is that resource runners receive a store whose account/provider scope exactly matches the connected account being synchronized, with no shared raw store object reused across active accounts in the same fanout.

## Live infrastructure blockers

The repository cannot currently prove live service-role Supabase per-account store construction, RLS enforcement, real cursor advancement across multiple accounts, provider throttling during multi-account fanout, or deployed scheduler concurrency. Those remain explicit infrastructure blockers. No live Google, Microsoft, Supabase, or scheduler execution success is claimed.
