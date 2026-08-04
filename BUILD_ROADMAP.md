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
### P3A — Calendar incremental sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google Calendar sync tokens and Microsoft calendarView delta
- [x] Normalized event mapping and terminal checkpoint guarantees
- [x] GitHub Actions validation
- [ ] Live calendar and Supabase event validation

### P3B — Contacts incremental sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Provider-neutral contact synchronization orchestration
- [x] Google People and Microsoft Graph contacts continuation
- [x] Normalized contact contract including deletions
- [x] Deterministic tests and GitHub Actions validation
- [ ] Supabase contact persistence
- [ ] Live contacts validation

### P3C — Meeting context graph — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Resolve equivalent provider contacts by normalized email
- [x] Connect calendar attendees to contacts and recent message threads
- [x] Exclude deleted contact tombstones
- [x] Bound messages per attendee and preserve provenance
- [x] Produce a compact meeting-preparation input boundary
- [x] Deterministic identity, linkage, ordering, and validation tests
- [x] GitHub Actions validation on branch head
- [ ] Supabase event/contact persistence integration
- [ ] Live account context validation

## P4 — Attention and memory
- [ ] AI triage with explainable scoring
- [ ] Catch Me Up briefs
- [ ] Meeting preparation generation
- [ ] Commitment extraction
- [ ] User-controlled memory and deletion
- [ ] Semantic search with tenant isolation

## P5 — Approval-gated actions
- [ ] Reply drafting
- [ ] Mail send opt-in scopes
- [ ] Calendar action opt-in scopes
- [ ] Approval UI, payload diff, audit, execution, and provider receipts
