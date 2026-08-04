# CompassOS Production Build Roadmap

## P0 — Secure account foundation — REVIEWABLE
- [x] Read-only provider scopes, PKCE/state, token-envelope encryption
- [x] Supabase account/token/cursor/action/audit schema and RLS
- [x] Pagination, retry, normalization, and outbound approval primitives

## P1 — Provider OAuth routes — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google and Microsoft authorization, callback, refresh, rotation, disconnect, and audit orchestration
- [ ] Live provider credential validation
- [ ] Live Supabase adapter integration test

## P2 — Incremental communication sync
- [x] Provider-neutral mail synchronization
- [x] Gmail history and Microsoft Graph mail delta adapters
- [x] Supabase message/thread/cursor persistence
- [x] Retry worker leasing and dead-letter operations
- [ ] Live mailbox and Supabase validation

## P3 — Calendar and contacts sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google Calendar sync tokens and Microsoft calendarView delta
- [x] Google People and Microsoft Graph contacts continuation
- [x] Cross-provider meeting context graph
- [ ] Supabase event/contact persistence and live account validation

## P4 — Attention and memory — IN PROGRESS
### P4A — OpenAI attention triage and Catch Me Up core — REVIEWABLE CORE / LIVE EVALUATION BLOCKED
- [x] Deterministic bounded candidate selection before model use
- [x] Explainable message indicators and pre-ranking
- [x] OpenAI Responses API server-side adapter
- [x] Structured JSON Schema output with `store: false`
- [x] Strict candidate-ID validation preventing invented items
- [x] Advisory priority, action, commitment, and due-date extraction
- [x] Catch Me Up grouping with source provenance
- [x] Provider request/error metadata without token exposure
- [x] Deterministic mock tests
- [x] GitHub Actions validation on branch head
- [ ] Live OpenAI API evaluation and prompt-quality dataset

### P4B — Meeting preparation and commitments — REVIEWABLE CORE / LIVE EVALUATION BLOCKED
- [x] Meeting preparation generation from P3C context
- [x] Strict attendee and source-thread provenance validation
- [x] Structured Responses API output with `store: false`
- [x] Proposed commitment creation from meeting preparation
- [x] User-owned confirmation, revision, completion, and dismissal lifecycle
- [x] User correction capture
- [x] Deterministic mock and state-transition tests
- [x] GitHub Actions validation on branch head
- [ ] Live OpenAI meeting-prep evaluation
- [ ] Supabase commitment and correction persistence

### P4C — User-controlled memory and semantic search — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Explicit user-owned memory save, edit, expiry, soft deletion, and audit lifecycle
- [x] Tenant-isolated semantic document contracts and ranking
- [x] Server-side OpenAI embedding adapter with configurable dimensions
- [x] Supabase pgvector schema, HNSW index, owner RLS, and service-role-only retrieval function
- [x] Source provenance and retrieval audit persistence
- [x] Expired and deleted document exclusion
- [x] Cross-tenant result rejection in application and store boundaries
- [x] Deterministic lifecycle, ranking, adapter, and isolation tests
- [x] GitHub Actions validation on branch head
- [ ] Live OpenAI embedding and Supabase pgvector validation

## P5 — Approval-gated actions
- [ ] Reply drafting
- [ ] Mail send opt-in scopes
- [ ] Calendar action opt-in scopes
- [ ] Approval UI, payload diff, audit, execution, and provider receipts
