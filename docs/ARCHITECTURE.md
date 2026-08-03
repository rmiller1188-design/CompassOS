# Production Foundation Architecture

## Security boundary

Browser clients receive account metadata only. OAuth client secrets, PKCE verifier envelopes, access tokens, refresh tokens, token refresh locks, provider webhooks, sync cursor writes, and outbound execution stay in server-side handlers.

`private.provider_tokens` is outside Supabase's exposed public schema. Token payloads are encrypted with AES-256-GCM using a versioned server-side key. The authenticated encryption context binds the envelope to the account/provider identity.

## Least privilege

Initial Google and Microsoft manifests request identity plus read-only scopes. Mail send and calendar write scopes are deliberately absent. Write scopes are a later opt-in milestone and must be tied to the approval/audit state machine.

## Sync model

Each provider adapter maps data into normalized message and event contracts. Cursor state supports Gmail history IDs, Microsoft Graph delta links, Google calendar sync tokens, and Microsoft calendar delta links. Workers use leases, bounded retries, pagination-cycle protection, idempotent provider identifiers, and per-resource failure counts.

## Outbound safety

Drafting and execution are separate. Any outbound email, message, or calendar change progresses through `draft -> pending_approval -> approved -> executing -> succeeded|failed`. Only the owning user may approve. Every transition produces an immutable audit event.
