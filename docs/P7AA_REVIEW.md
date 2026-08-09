# P7AA Review — Account-scoped sync scheduler leases

## Disposition

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED** once the exact final branch head passes the repository production validation gate.

P7AA addresses overlapping scheduler runs against the same connected account. P7Z established per-account store isolation, but separate workers could still race the same account's mail/calendar/contacts cursor progression. P7AA adds an account-level lease boundary before resource runners execute.

## Production changes

- `src/sync/account-sync-lease.js` adds a service-side lease manager with exact account/provider/worker/token binding.
- Lease duration is bounded between 5 seconds and 15 minutes, with a 120-second default.
- Supabase claim, heartbeat, and release errors cross the application boundary only as sanitized retryable control errors.
- `src/sync/unified-sync-coordinator.js` can require account leasing for production scheduler composition.
- An already-leased account is skipped before any mail/calendar/contacts resource runner executes; unrelated accounts remain independently eligible to run.
- Acquired leases are released through a `finally` boundary after account resource execution.
- The existing coordinator policy output remains backward-compatible; lease-specific policy is exposed separately by the lease module.

## Supabase boundary

Migration `20260809_account_sync_leases.sql` creates `public.account_sync_leases` and service-role-only claim/heartbeat/release RPCs. Browser roles receive no table or function authority. Claim is restricted to an exact active connected account/provider and can replace only an expired lease or a lease already owned by the same worker. Heartbeat and release require the exact worker and rotating lease token.

## Deterministic validation scope

The P7AA suite covers exact claim arguments, busy-account contention behavior, no resource execution without a lease, guaranteed release after success and resource failure, backend-error sanitization, lease scope drift, lease expiry, and fail-closed production composition when the required lease resolver is missing. The lease module is part of `npm run validate` and package version is `0.44.0`.

The first implementation CI pass intentionally remained non-reviewable after an existing coordinator policy assertion failed because the candidate added an unnecessary policy field. The public policy contract was restored instead of modifying unrelated compatibility expectations. Final reviewability depends on a fresh exact-head CI pass after this correction and documentation updates.

## Safety posture

P7AA adds no OAuth scopes, browser credential authority, provider-write authority, outbound-action bypass, unsupported iMessage access, or fake provider/database data. Existing OAuth containment, Supabase account isolation requirements, outbound approval/policy/idempotency/reconciliation/audit controls, and user-controlled memory constraints remain unchanged.

## Live validation blockers

The migration has not been applied to a configured Supabase environment in this build context. Service-role RPC authorization, RLS behavior, true multi-worker claim contention, lease heartbeat during long provider syncs, expiry/recovery under worker failure, scheduler overlap, and durable cursor advancement therefore remain live-infrastructure blockers. No live Google, Microsoft, Supabase, network, or deployed scheduler success is claimed.
