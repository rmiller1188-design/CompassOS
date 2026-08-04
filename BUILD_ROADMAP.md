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

## P1 — Provider OAuth routes
- [ ] Google authorization and callback handlers
- [ ] Microsoft authorization and callback handlers
- [ ] Server-side code exchange
- [ ] Refresh-token rotation and refresh locking
- [ ] Revocation and reauthorization flows
- [ ] Integration tests with provider sandbox/mocks

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
