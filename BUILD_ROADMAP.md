# CompassOS Production Build Roadmap

## P0 — Secure account foundation — REVIEWABLE
- [x] Dedicated CompassOS repository
- [x] Read-only Google and Microsoft scope manifests
- [x] OAuth state and PKCE primitives
- [x] Authenticated token-envelope encryption
- [x] Supabase account/token/cursor/action/audit schema
- [x] RLS ownership policies and private token schema
- [x] Pagination, retry, and cursor-cycle protections
- [x] Normalized message and event contracts
- [x] Explicit outbound approval state machine
- [x] Dependency-free unit tests

## P1 — Provider OAuth routes — IN PROGRESS
### P1A — Provider protocol runtime — REVIEWABLE
- [x] Google and Microsoft authorization endpoint configuration
- [x] PKCE authorization URL generation
- [x] Server-side authorization-code exchange
- [x] Refresh-token rotation preservation
- [x] Provider identity normalization
- [x] Google revocation and Microsoft local-disconnect semantics
- [x] Typed retryable/non-retryable provider errors
- [x] Dependency-free provider mock tests
- [x] GitHub Actions validation workflow

### P1B — Application route integration — VALIDATION PENDING
- [x] Authenticated authorization-start handler
- [x] Single-use OAuth state consumption contract
- [x] Callback handler with encrypted PKCE verifier recovery
- [x] Connected-account upsert and encrypted token persistence contract
- [x] Refresh locking and reauthorization state transitions
- [x] Disconnect endpoint and audit events
- [x] Replay, token-at-rest, refresh, and invalid-grant tests authored
- [ ] GitHub Actions or equivalent complete validation run
- [ ] Live provider credential validation
- [ ] Concrete Supabase adapter integration test

## P2 — Incremental communication sync
- [ ] Gmail full bootstrap plus history sync
- [ ] Microsoft Graph mail delta sync
- [ ] Pagination and attachment metadata
- [ ] Normalized thread/message persistence
- [ ] Retry queues, rate-limit handling, and dead-letter visibility

## P3 — Calendar and contacts sync
- [ ] Google Calendar sync tokens
- [ ] Microsoft calendar delta sync
- [ ] Google and Microsoft contacts
- [ ] Meeting-context graph

## P4 — Attention and memory
- [ ] AI triage with explainable scoring
- [ ] Catch Me Up briefs
- [ ] Meeting preparation
- [ ] Commitment extraction
- [ ] User-controlled memory and deletion
- [ ] Semantic search with tenant isolation

## P5 — Approval-gated actions
- [ ] Reply drafting
- [ ] Mail send opt-in scopes
- [ ] Calendar action opt-in scopes
- [ ] Approval UI, payload diff, audit, execution, and provider receipts
