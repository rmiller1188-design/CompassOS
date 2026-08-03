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

## P1 — Provider OAuth routes — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google and Microsoft provider protocol runtime
- [x] Authenticated authorization-start and callback orchestration
- [x] Encrypted PKCE persistence and single-use state
- [x] Refresh locking, rotation, reauthorization, disconnect, and audit
- [ ] Live provider credential validation
- [ ] Concrete Supabase adapter integration test

## P2 — Incremental communication sync — IN PROGRESS
### P2A — Provider-neutral mail sync core — VALIDATION PENDING
- [x] Bootstrap versus incremental cursor selection
- [x] Bounded pagination and cursor-cycle rejection
- [x] Normalized message upsert boundary
- [x] Terminal checkpoint persistence only after page completion
- [x] Rate-limit/transient/auth failure classification
- [x] Reauthorization transition on expired credentials
- [x] Sync-run audit contract and dependency-free tests
- [ ] GitHub Actions complete validation on branch head
- [ ] Concrete Gmail history adapter
- [ ] Concrete Microsoft Graph delta adapter
- [ ] Supabase message/cursor adapter integration

### P2B — Provider adapters and persistence
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
