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
- [ ] Live Supabase adapter integration test

## P2 — Incremental communication sync — IN PROGRESS
### P2A — Provider-neutral mail sync core — REVIEWABLE
- [x] Bootstrap versus incremental cursor selection
- [x] Bounded pagination and cursor-cycle rejection
- [x] Normalized message upsert boundary
- [x] Terminal checkpoint persistence only after page completion
- [x] Rate-limit/transient/auth failure classification
- [x] Reauthorization transition on expired credentials
- [x] Sync-run audit contract and dependency-free tests
- [x] GitHub Actions validation on branch head

### P2B — Gmail and Microsoft mail protocol adapters — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Gmail full bootstrap pagination
- [x] Gmail history-based incremental sync
- [x] Gmail metadata normalization and history checkpointing
- [x] Microsoft Graph message delta sync
- [x] Opaque Graph nextLink/deltaLink continuation
- [x] Provider retry-after propagation
- [x] Deterministic provider mock tests
- [ ] Live Gmail mailbox validation
- [ ] Live Microsoft 365 mailbox validation

### P2C — Supabase mail persistence — VALIDATION PENDING
- [x] Account-bound Supabase store adapter
- [x] Message and derived thread upserts
- [x] Provider-specific cursor persistence
- [x] Sync-run records
- [x] Retry queue persistence
- [x] Reauthorization account transition
- [x] Owner-read RLS and service-role-only ingestion boundary
- [x] Cross-account write rejection tests
- [ ] GitHub Actions validation on branch head
- [ ] Live Supabase migration and integration validation
- [ ] Worker leasing and dead-letter promotion execution

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
