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
### P2A — Provider-neutral mail sync core — REVIEWABLE
- [x] Bootstrap/incremental orchestration, bounded pagination, terminal checkpointing, failure classification

### P2B — Gmail and Microsoft mail protocol adapters — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Gmail history synchronization and Microsoft Graph message delta synchronization
- [ ] Live Gmail and Microsoft 365 mailbox validation

### P2C — Supabase mail persistence — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Account-bound message/thread/cursor/sync/retry persistence and owner-read RLS
- [ ] Live Supabase migration and integration validation

### P2D — Retry worker and dead-letter operations — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Atomic retry claiming, worker leases, bounded backoff, attempt limits, and dead-letter visibility
- [x] GitHub Actions validation on branch head
- [ ] Live scheduled worker deployment

## P3 — Calendar and contacts sync — IN PROGRESS
### P3A — Google and Microsoft calendar incremental sync — VALIDATION PENDING
- [x] Provider-neutral calendar synchronization orchestration
- [x] Google Calendar bootstrap, page tokens, and sync tokens
- [x] Microsoft calendarView delta, nextLink, and deltaLink handling
- [x] Normalized event mapping and terminal checkpoint guarantees
- [x] Deterministic provider and orchestration tests
- [ ] GitHub Actions validation on branch head
- [ ] Live Google and Microsoft calendar validation
- [ ] Supabase event persistence integration

### P3B — Contacts and meeting context
- [ ] Google People incremental contacts
- [ ] Microsoft contacts delta synchronization
- [ ] Contact identity resolution
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
