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

### P5B — Provider execution and receipts — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Mail-send opt-in scope enforcement separate from read consent
- [x] Gmail reply execution adapter
- [x] Microsoft Graph reply execution adapter
- [x] Pre-execution ownership, consent, state, and approval-hash verification
- [x] Idempotency receipt lookup preventing duplicate provider execution
- [x] Provider receipt and failure audit contract
- [x] Supabase receipt schema with owner-read RLS and service-role-only writes
- [x] Deterministic consent, adapter, mutation, failure, and idempotency tests
- [x] GitHub Actions validation on branch head
- [ ] Live consent upgrade and provider-send validation

### P5C — Calendar approval and execution — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Separate Google and Microsoft calendar-write consent enforcement
- [x] Canonical create, update, and response approval payloads
- [x] Deterministic payload hashes and field-level approval diffs
- [x] Google Calendar create, patch, and attendee-response adapter
- [x] Microsoft Graph create, patch, accept, tentative, and decline adapter
- [x] Ownership, state, consent, approval-hash, and idempotency enforcement
- [x] Calendar provider receipt fields and owner-read RLS extension
- [x] Deterministic validation, adapter, secret-isolation, failure, and idempotency tests
- [x] GitHub Actions validation on branch head
- [ ] Live calendar-write consent and provider execution validation

### P5D — Encrypted action persistence and audit integrity — VALIDATION PENDING
- [x] User/account-bound outbound action store
- [x] AES-256-GCM payload envelopes with action-specific authenticated context
- [x] Separate payload revision and state revision tracking
- [x] Optimistic concurrency on edits and state transitions
- [x] Approval invalidation after encrypted payload replacement
- [x] Tamper-evident per-action audit hash chains
- [x] Append-only audit-event database enforcement
- [x] Owner-read and service-role-only action mutation boundary
- [x] Deterministic encryption, context-binding, tamper, and audit-chain tests
- [ ] GitHub Actions validation on branch head
- [ ] Live Supabase migration and service-role integration validation

## P6 — Command-center product surface
### P6A — Approval command-center UX
- [ ] Phone-first approval inbox with clear payload diffs
- [ ] Desktop split-view approval workflow
- [ ] Accessibility, keyboard navigation, and destructive-action safeguards
- [ ] EdgePilot-AI benchmark and responsive interaction pass
