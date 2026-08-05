# P5D Review — Encrypted Action Persistence and Audit Integrity

## Review status

**REVIEWABLE CORE MILESTONE.** GitHub Actions `Validate production core` run 170 completed successfully on branch head `e929f876f26d0883a60c6b147a72dce93ad995c0`. A final validation run is required on the documentation-updated review head before merge consideration.

## Scope

P5D closes the encrypted outbound-payload persistence gap between approval drafting and provider execution. It adds an account-bound Supabase store for creating, loading, replacing, and transitioning outbound actions without exposing plaintext payloads in database rows or browser-writable state.

## Security properties

- AES-256-GCM envelopes use authenticated context containing the action ID, owner ID, connected-account ID, action type, payload revision, and payload hash.
- Payload revisions are independent from workflow-state revisions, so approval-state transitions do not invalidate unchanged ciphertext.
- Payload replacement resets the action to draft and clears prior approval metadata.
- Every update uses expected-revision optimistic concurrency and fails closed on stale state.
- Audit records are linked by SHA-256 hashes per action.
- Audit rows are append-only at the database layer.
- Browser insert/update/delete policies for outbound actions are removed; service-role code owns mutation.
- Owner-readable RLS remains available for safe action and audit inspection.

## Validation coverage

Deterministic tests cover canonical payload hashing, encryption/decryption, owner and account context binding, payload-revision binding, workflow revision independence, ciphertext tamper rejection, envelope-context tamper rejection, and audit-chain sensitivity to metadata changes.

## Not included

- No live Supabase migration was applied.
- No production service-role client was exercised.
- No provider mail or calendar action was executed.
- No browser approval UI was added.
- No unsupported iMessage database access was introduced.

## Infrastructure blockers

A configured Supabase project, service-role credential, action encryption key, and controlled integration environment are required for live migration, RLS, transaction, and concurrency validation. No live database or provider-execution success is claimed.
