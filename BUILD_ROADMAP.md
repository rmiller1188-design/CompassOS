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

## P3 — Calendar and contacts sync — IN PROGRESS
### P3A — Calendar incremental sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google Calendar sync tokens and Microsoft calendarView delta
- [x] Normalized event mapping and terminal checkpoint guarantees
- [x] GitHub Actions validation
- [ ] Live calendar and Supabase event validation

### P3B — Contacts incremental sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Provider-neutral contact synchronization orchestration
- [x] Google People connections pagination and sync tokens
- [x] Microsoft Graph contacts delta continuation
- [x] Normalized contact contract including deletions
- [x] Terminal-only checkpoint advancement and cursor-cycle protection
- [x] Deterministic provider and orchestration tests
- [x] GitHub Actions validation on branch head
- [ ] Supabase contact persistence and identity resolution
- [ ] Live Google and Microsoft contacts validation

### P3C — Meeting context graph
- [ ] Resolve contacts across provider identities
- [ ] Connect contacts, messages, threads, and calendar attendees
- [ ] Meeting preparation context boundary

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
