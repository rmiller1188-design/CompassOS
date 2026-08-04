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

### P4B — Meeting preparation and commitments
- [ ] Meeting preparation generation from P3C context
- [ ] Commitment lifecycle and confirmation workflow
- [ ] User correction and feedback capture

### P4C — User-controlled memory and semantic search
- [ ] Tenant-isolated embeddings and semantic retrieval
- [ ] Explicit memory save, edit, expiry, and deletion
- [ ] Source provenance and retrieval audit

## P5 — Approval-gated actions
- [ ] Reply drafting
- [ ] Mail send opt-in scopes
- [ ] Calendar action opt-in scopes
- [ ] Approval UI, payload diff, audit, execution, and provider receipts
