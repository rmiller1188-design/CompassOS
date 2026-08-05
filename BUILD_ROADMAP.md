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

## P5 — Approval-gated actions — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Reply drafting, canonical hashing, reviewable diffs, and approval invalidation
- [x] Approval-gated Gmail and Microsoft reply execution with receipts
- [x] Approval-gated Google and Microsoft calendar execution
- [x] Encrypted action persistence and tamper-evident audit chains
- [ ] Live provider-write consent, provider execution, and Supabase validation

## P6 — Reliable command-center execution — IN PROGRESS
### P6A — Atomic action queue and execution leases — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Atomic oldest-first approved-action claiming with `FOR UPDATE SKIP LOCKED`
- [x] Service-role-only worker lease acquisition and recovery RPCs
- [x] Payload hash and payload revision binding on every execution lease
- [x] Lease heartbeat with worker ownership and expiry enforcement
- [x] Expired lease recovery to a non-executable failed state
- [x] Provider receipt provenance on successful terminal transitions
- [x] Structured retry metadata on failed transitions
- [x] Deterministic lease, mutation, expiry, claim, success, and failure tests
- [ ] Live Supabase concurrency, crash recovery, and provider execution validation

### P6B — Approval command-center UX
- [ ] Phone-first approval inbox with clear payload diffs
- [ ] Desktop split-view approval workflow
- [ ] Accessibility, keyboard navigation, and destructive-action safeguards
- [ ] EdgePilot-AI benchmark and responsive interaction pass
