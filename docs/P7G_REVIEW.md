# P7G Review — Ambiguous Provider Execution Reconciliation

## Status

**REVIEWABLE CORE MILESTONE.** GitHub Actions `Validate production core` run 275 passed on implementation head `1ea1bd162cb9d4fac29b106e3828dcebe305276d`. Live provider/database reconciliation remains infrastructure-blocked, and the final documentation head must also pass repository validation before this branch is considered complete.

## Production problem closed

Outbound mail and calendar APIs can produce an unsafe ambiguity: the provider may have accepted the action while Compass loses the response, times out after the request was sent, or fails while persisting the terminal receipt. Blindly retrying those cases can duplicate mail, replies, invitations, or calendar mutations.

P7G changes the failure model so ambiguous outcomes are quarantined for reconciliation instead of being automatically treated as retryable failures.

## Included

- explicit ambiguous-outcome classification for network failures, request-sent 5xx responses, and known post-provider receipt-persistence failures
- deterministic SHA-256 hashing of idempotency keys before reconciliation persistence
- reconciliation records bound to action, owner, connected account, provider, action type, payload hash/revision, approval revision, worker, policy decision, and known provider receipt
- service-role-only reconciliation writes and resolutions
- owner-read Supabase RLS
- worker integration that records reconciliation before terminal failure handling
- blind retry disabled whenever reconciliation is required
- explicit detection of provider success followed by Compass terminal-receipt persistence failure
- deterministic local/provider reconciliation outcomes: local receipt found, provider confirmed success, provider confirmed absence, unresolved/manual review
- fail-closed handling when provider lookup is unavailable or remains unknown

## Security posture

- provider tokens are not persisted in reconciliation records
- raw idempotency keys are not persisted; only a SHA-256 digest is stored
- browser clients cannot create, mutate, or resolve reconciliation cases
- ambiguous actions cannot be automatically retried by the execution worker
- reconciliation cannot bypass the original approval, payload, or runtime-policy binding
- provider-confirmed success must include a receipt before Compass may classify it as resolved success
- unresolved provider state requires manual review rather than resend
- no unsupported iMessage access and no fake production evidence

## Validation

GitHub Actions `Validate production core` run 275 succeeded on implementation head `1ea1bd162cb9d4fac29b106e3828dcebe305276d`. `npm run validate` syntax-checked the reconciliation module and complete production core, then executed the full Node test suite. New deterministic tests cover ambiguity classification, secret-safe idempotency binding, reconciliation construction, definitive-failure rejection, local receipt recovery, provider-confirmed success/absence, unknown outcomes, worker quarantine, retry suppression, and post-provider receipt-persistence failure.

## Infrastructure blockers

The reconciliation migration has not been applied to a configured Supabase project. No live Gmail or Microsoft Graph ambiguous-response drill, provider lookup adapter, service-role reconciliation worker, transaction-failure injection, or manual-review UX has been exercised. No live database or provider reconciliation success is claimed.
