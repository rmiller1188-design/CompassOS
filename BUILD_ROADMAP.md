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

## P4 — Attention and memory — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] OpenAI attention triage and Catch Me Up core
- [x] Meeting preparation and user-owned commitment lifecycle
- [x] User-controlled memory and tenant-isolated semantic search
- [ ] Live OpenAI evaluation and Supabase pgvector validation

## P5 — Approval-gated actions — IN PROGRESS
### P5A — Reply drafting and approval integrity — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Server-side OpenAI reply drafting with strict structured output and `store: false`
- [x] Source-message provenance validation
- [x] Normalized recipients and immutable canonical payload hashing
- [x] Reviewable payload diff generation
- [x] Approval invalidation after any payload change
- [x] Deterministic draft, provenance, hashing, diff, and approval-integrity tests
- [x] GitHub Actions validation on branch head
- [ ] Live OpenAI reply-quality evaluation
- [ ] Supabase encrypted outbound payload persistence

### P5B — Provider execution and receipts
- [ ] Mail send opt-in scopes and separate consent upgrade
- [ ] Gmail reply execution adapter
- [ ] Microsoft Graph reply execution adapter
- [ ] Pre-execution approval/hash verification
- [ ] Provider receipt and failure audit persistence

### P5C — Calendar approval actions and UX
- [ ] Calendar action opt-in scopes
- [ ] Approval UI with payload diff on phone and desktop
- [ ] Event create/update/respond execution adapters
- [ ] Accessibility and EdgePilot-AI UX benchmark pass
