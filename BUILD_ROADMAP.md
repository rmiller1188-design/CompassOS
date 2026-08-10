# CompassOS Production Build Roadmap

CompassOS is a production-first personal communications command center spanning supported mail, calendar, contacts, commitments, memory, semantic search, and one OpenAI-powered attention layer. Reviewable source milestones are intentionally separated from live-infrastructure validation.

## P0 — Secure account foundation — REVIEWABLE
- [x] Read-only provider scopes, PKCE/state, token-envelope encryption
- [x] Supabase account/token/cursor/action/audit schema and RLS
- [x] Pagination, retry, normalization, and outbound approval primitives

## P1 — Provider OAuth routes — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google and Microsoft authorization, callback, refresh, rotation, disconnect, and audit orchestration
- [ ] Live provider credential and Supabase adapter validation

## P2 — Incremental communication sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Gmail history and Microsoft Graph mail delta synchronization
- [x] Provider-neutral normalized messages/threads and cursor persistence
- [x] Retry worker leasing and dead-letter operations
- [ ] Live mailbox and Supabase validation

## P3 — Calendar and contacts sync — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google Calendar sync tokens and Microsoft calendarView delta
- [x] Google People and Microsoft Graph contacts continuation
- [x] Cross-provider meeting context graph
- [ ] Live provider and Supabase persistence validation

## P4 — Attention and memory — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] OpenAI attention triage and Catch Me Up core
- [x] Meeting preparation and user-owned commitment lifecycle
- [x] User-controlled memory and tenant-isolated semantic search
- [ ] Live OpenAI evaluation and Supabase pgvector validation

## P5 — Approval-gated actions — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Reply drafting, canonical hashing, reviewable diffs, and approval invalidation
- [x] Approval-gated Gmail/Microsoft replies and Google/Microsoft calendar actions
- [x] Encrypted action persistence and tamper-evident audit chains
- [ ] Live provider-write consent, provider execution, and Supabase validation

## P6 — Reliable command-center execution — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
### P6A — Atomic action queue and execution leases
- [x] Oldest-first `FOR UPDATE SKIP LOCKED` action claims
- [x] Service-role-only lease acquisition, heartbeat, expiry, recovery, and provider receipt provenance
- [x] Payload hash/revision binding and deterministic queue tests
- [ ] Live Supabase concurrency/crash recovery

### P6B — Approval command-center UX
- [x] Phone-first approval inbox and desktop split view
- [x] Accessible keyboard/destructive-action safeguards and responsive workflow pass
- [x] Tenant and payload revision/hash binding on decisions
- [ ] Browser automation, physical-device, screen-reader, and live Supabase validation

### P6C — Operational observability and recovery
- [x] Sync/AI/approval/execution health model and blocked/degraded precedence
- [x] User-safe retry/reconnect/review guidance
- [x] Recursive secret, bearer-token, and email redaction
- [x] Pseudonymized support export
- [ ] Live telemetry ingestion, provider reconnect UX, and support workflow validation

## P7 — Production integration and evaluation — IN PROGRESS
### P7A — Production readiness gates — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Fail-closed Supabase/provider/OpenAI runtime configuration inspection
- [x] Public-client secret exposure detection
- [x] Ordered migration manifest and deterministic validation disposition
- [ ] Apply migrations and run live RLS/OAuth/sync/OpenAI/browser/worker validation

### P7B — Validation evidence ledger — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] CI/staging/production evidence records, freshness, completeness, and provenance hashing
- [x] Fail-closed missing/stale/tampered evidence behavior
- [ ] Populate with live infrastructure evidence

### P7C — Release candidate and promotion gates — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Immutable candidate binding to commit/artifact/migrations/evidence
- [x] Candidate-specific approval threshold, expiry, rejection, mutation invalidation, and deterministic hashes
- [ ] Execute a real staging-to-production promotion

### P7D — Progressive rollout and rollback gates — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Candidate-bound canary/percentage/all-at-once rollout plans
- [x] Fail-closed freshness/sample/error/latency/queue/alert and rollback-readiness gates
- [ ] Execute a live canary rollout and rollback drill

### P7E — Runtime outbound-action policy and emergency stops — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Immutable policy snapshots; global/provider/account/action emergency stops
- [x] Exact approval payload/revision binding and stale-policy fail-closed behavior
- [ ] Live policy distribution and incident-control surface

### P7F — Policy-enforced execution worker — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Database-bound approval hash/revision and immutable approved/executing payloads
- [x] Runtime policy + provider consent revalidation before provider execution
- [x] Decision persistence before provider call, idempotency receipt handling, terminal audit provenance
- [ ] Apply migration and run live service-role worker/provider sandbox execution

### P7G–P7M — Reconciliation, retry, and OAuth refresh boundaries — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Ambiguous provider outcomes quarantine instead of blind retry
- [x] Manual adjudication requires provider-confirmed absence before retry admission
- [x] Provider-correlated Gmail/Microsoft mail and Google/Microsoft calendar reconciliation
- [x] Deterministic reconciliation evidence handoff and bounded retry worker
- [x] Account/provider-bound OAuth refresh and reconnect/manual-review behavior
- [ ] Run live quarantine → refresh → lookup → evidence → adjudication → retry drills

### P7N–P7Q — Provider credential containment — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Contained provider-session credential capability with no ambient token access
- [x] Telemetry-safe worker diagnostics and pseudonymous account references
- [x] Capability-only provider credential consumption
- [x] Single-use, short-lived credential capabilities with replay/concurrency rejection
- [ ] Validate live provider adapter and deployed telemetry/APM behavior

### P7R–P7S — Purpose-bound reconciliation provider access — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Exact `reconciliation.lookup` purpose/action/account/provider binding
- [x] Gmail, Microsoft mail, Google Calendar, and Microsoft Calendar adapters consume purpose-bound credentials only
- [x] Capability replay or binding drift fails closed before additional provider execution
- [ ] Validate live OAuth → purpose-bound provider lookup behavior

### P7T — Reconciliation provider egress confinement — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Exact HTTPS origin/API-path allowlists, GET-only/bodyless requests, redirect denial, and bearer requirements
- [x] Provider/kind route drift and URL credential/fragment attempts fail closed
- [ ] Validate live redirect, DNS/TLS/proxy, and constrained provider behavior

### P7U — Reconciliation provider response trust boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] 256 KiB body ceiling, streamed byte accounting, JSON media type, final-URL validation, and eager UTF-8 JSON decode
- [x] Malformed successful responses cannot become provider-confirmed absence evidence
- [ ] Validate live provider headers, streaming, encoding, and proxy transformations

### P7V–P7X — Provider retry/error semantics — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Stable sanitized provider auth/rate-limit/transient/rejected error classes
- [x] End-to-end delta-seconds and HTTP-date `Retry-After` propagation
- [x] Provider `Date` header used for HTTP-date retry timing when valid
- [x] Existing 15-minute retry ceiling remains authoritative
- [ ] Validate live throttling, provider clocks, proxy mutation, and service-role scheduling

### P7Y — Unified multi-account incremental sync coordinator — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Orchestrate mail/calendar/contacts across active Google and Microsoft accounts
- [x] Validate duplicate accounts, providers/resources, and page limits before provider work
- [x] Isolate account failures and reauthorization to the affected account
- [x] Sanitize coordinator result envelopes
- [ ] Validate live multi-account OAuth fanout, persistence, throttling, and scheduler execution

### P7Z — Account-bound multi-account sync persistence — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Resolve persistence separately per active connected account
- [x] Reject cross-account store calls and raw-store reuse across accounts
- [x] Skip inactive accounts before adapter/store resolution
- [ ] Validate live Supabase RLS, per-account store resolution, and cursor persistence

### P7AA — Account-scoped sync scheduler leases — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Service-role-only atomic claim/heartbeat/release RPCs
- [x] Exact account/provider/worker/token binding with 5-second to 15-minute lease duration
- [x] Busy-account skip and guaranteed release attempt
- [ ] Validate live RLS/RPC behavior, contention, expiry recovery, and scheduler overlap

### P7AB — Long-running sync lease heartbeat integration — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Renew account ownership before resources and after every provider page fetch
- [x] Carry refreshed lease ownership through release
- [x] Lease loss prevents cursor advancement and stops only the affected account
- [ ] Validate live heartbeat rotation, crash/restart recovery, and durable cursor progression

### P7AC — In-flight sync lease guard and provider cancellation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Heartbeat while mail/calendar/contacts provider reads are in flight
- [x] Abort provider reads when lease ownership is lost or heartbeat backend fails
- [x] Propagate `AbortSignal` through all supported Google/Microsoft read adapters
- [x] Preserve post-fetch heartbeat before normalization/persistence/cursor advancement
- [ ] Validate live provider cancellation, connection teardown, proxy behavior, and multi-worker contention

### P7AD — Lease-fenced cursor advancement — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Pass the post-fetch account lease through mail, calendar, and contacts final checkpoint writes
- [x] Add a service-role-only Supabase cursor-save RPC that locks and verifies the exact live account/provider/worker/token lease in the same database transaction as cursor advancement
- [x] Reject expired, replaced, cross-account, cross-provider, inactive-account, or otherwise stale lease ownership before cursor mutation
- [x] Sanitize fence/backend failures into retryable sync-control errors without leaking database diagnostics
- [x] Preserve idempotent normalized-record upserts while preventing stale workers from moving the durable provider cursor forward
- [x] Add deterministic fenced-RPC routing, lease-loss, backend-sanitization, scope-drift, and all-resource checkpoint propagation tests
- [x] Bump package version to 0.47.0 and retain the production-core validation chain
- [ ] Apply the migration and validate live Supabase row locking, lease expiry/claim contention, service-role authorization, crash recovery, and durable cursor progression

### P7AE — Sync failure persistence safety boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Canonicalize failed mail/calendar/contacts sync persistence to an allowlisted reason and stable safe message
- [x] Drop arbitrary provider and sync-invariant text before `sync_runs.message` and retry `last_error` persistence
- [x] Re-sanitize at the Supabase persistence boundary and bound retry delay metadata to 1 second–15 minutes
- [x] Preserve original errors only for in-process control flow while keeping persisted diagnostics non-secret
- [x] Add deterministic runner, Supabase persistence, retry-bound, unknown-reason, and leakage tests
- [x] Bump package version to 0.48.0 and include the boundary in production-core validation
- [ ] Validate live Google/Microsoft error payloads, configured Supabase persistence/RLS visibility, deployed logging/APM, and retry-worker diagnostics

## Cross-cutting live validation blockers
- [ ] Apply and verify all Supabase migrations and RLS/service-role boundaries
- [ ] Validate real Google and Microsoft OAuth, sync, pagination, reconnect, refresh/rotation, and provider-side reconciliation markers
- [ ] Run user-approved OpenAI quality, latency, and cost evaluation
- [ ] Validate browser, phone, desktop, accessibility, worker recovery, telemetry ingestion, and incident-response behavior

## Non-negotiable product constraints
- Least-privilege read access first; provider write scopes only for explicitly approved actions
- Server-side secrets and encrypted token handling; no browser credential authority
- Supabase tenant isolation/RLS and user-controlled memory
- Explicit approval + audit before outbound mail/message/calendar actions
- No unsupported iMessage database access
- No fake provider/database evidence in the production path