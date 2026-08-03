# CompassOS P1B Review Artifact

Date: 2026-08-03
Status: REVIEWABLE

## Scope

P1B adds the framework-neutral OAuth application boundary for Google and Microsoft connected accounts: authenticated authorization start, encrypted PKCE verifier storage, single-use state consumption, callback exchange, normalized provider identity, encrypted token persistence, account-scoped refresh locking, refresh-token rotation, reauthorization transitions, ownership-checked disconnect, revocation attempts, and audit events.

## Security boundaries

- Provider credentials and tokens remain server-side.
- PKCE verifiers are encrypted at rest.
- OAuth state is expiring and single-use.
- Token envelopes are bound to user, provider, and provider subject context.
- Read-only scopes remain the only requested scopes.
- No outbound mail, message, or calendar action is enabled.

## Validation

GitHub Actions `Validate production core` run 17 passed on Node 22.23.1 after correcting deterministic token-expiry clock propagation.

- Syntax checks: passed
- Node test suite: passed
- OAuth refresh rotation and invalid-grant transition tests: passed

## Infrastructure not yet validated

- Live Google OAuth app registration and callback
- Live Microsoft Entra app registration and callback
- Concrete Supabase store adapters
- Live Supabase migration/integration test

No live-provider or live-database success claim is made.

## Next milestone

P2 starts incremental communication synchronization: Gmail bootstrap/history sync, Microsoft Graph delta sync, normalized thread/message persistence, bounded pagination, retries, rate-limit handling, and cursor recovery.
