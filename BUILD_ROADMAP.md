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

## P6 — Reliable command-center execution — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
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

### P6B — Approval command-center UX — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Phone-first approval inbox with clear payload diffs
- [x] Desktop split-view approval workflow
- [x] Accessibility, keyboard navigation, and destructive-action safeguards
- [x] Responsive interaction pass benchmarked against EdgePilot-AI workflow goals
- [x] Tenant filtering and payload hash/revision binding on decision requests
- [x] Deterministic UX, safety, escaping, and accessibility-model tests
- [ ] Browser automation, physical-device, screen-reader, and live Supabase validation

### P6C — Operational observability and recovery — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Structured sync, AI, approval, and execution health model
- [x] Latest-per-subsystem health aggregation and blocked/degraded precedence
- [x] User-safe retry, reconnect, review, and no-op recovery guidance
- [x] Recursive secret, bearer-token, and email redaction
- [x] Pseudonymized support export with optional account-ID inclusion
- [x] Deterministic health, recovery, redaction, export, and invalid-input tests
- [ ] Live telemetry ingestion, provider reconnect UX, and support workflow validation

## P7 — Production integration and evaluation — IN PROGRESS
### P7A — Production readiness gates — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Fail-closed runtime configuration inspection for Supabase, provider, and OpenAI dependencies
- [x] Detection of secrets exposed through public client environment prefixes
- [x] Deterministic ordered migration manifest with duplicate detection and SHA-256 evidence
- [x] Explicit passed, blocked, and failed validation dispositions
- [x] Secret-value exclusion from readiness reports
- [x] Deterministic runtime, migration, privacy, and blocker-classification tests
- [ ] Apply migrations and run live RLS, OAuth, sync, OpenAI, browser, and worker validation

### P7B — Validation evidence ledger — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Normalized CI, staging, and production evidence records
- [x] Required-control completeness and latest-evidence selection
- [x] Evidence expiration and fail-closed missing-evidence behavior
- [x] Failed-over-blocked disposition precedence
- [x] Commit, workflow-run, artifact-digest, entry-hash, and ledger-hash provenance
- [x] Deterministic completeness, freshness, tamper, and malformed-input tests
- [ ] Populate the ledger with live Supabase, provider, OpenAI, browser/device, and worker evidence

### P7C — Release candidate and promotion gates — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Immutable release-candidate manifest bound to commit, artifact, migrations, and evidence ledger
- [x] Deterministic candidate and promotion-report hashing
- [x] Fail-closed production-readiness, migration, evidence-ledger, and commit binding checks
- [x] Candidate-specific approval threshold, expiration, rejection, and mutation invalidation
- [x] Duplicate-approver and malformed-input rejection
- [x] Deterministic integrity, mismatch, stale-approval, rejection, and tamper tests
- [ ] Execute a real staging-to-production promotion with live evidence and deployment infrastructure

### P7D — Progressive rollout and rollback gates — VALIDATION PENDING
- [x] Immutable rollout plan bound to release candidate, promotion report, and rollback artifact
- [x] Canary, percentage, and all-at-once strategy validation
- [x] Fail-closed freshness, sample-count, error-rate, latency, queue-age, and critical-alert gates
- [x] Rollback readiness required before any rollout advance
- [x] Deterministic rollout-plan and decision hashes with tamper detection
- [x] Deterministic healthy advance, rollback, stale-observation, malformed-input, and tamper tests
- [ ] Pass repository validation on the exact branch head
- [ ] Execute a real canary rollout and rollback drill with live infrastructure evidence

### P7E — Runtime outbound-action policy and emergency stops — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Immutable runtime action-policy snapshots with deterministic policy hashes
- [x] Global, provider, account, and action-scoped emergency block rules
- [x] Expiring block rules and future-rule activation protection
- [x] Exact approved payload hash and payload-revision binding before execution
- [x] Stale or future policy snapshots fail closed
- [x] Deterministic action-decision hashes and tamper detection
- [x] Deterministic scope-isolation, approval-mutation, expiry, stale-policy, malformed-input, and tamper tests
- [x] Pass repository validation on the exact branch head
- [ ] Wire policy snapshots to a live service-role execution worker and incident-control surface

### P7F — Policy-enforced execution worker — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Persist exact approved payload hash and payload revision at the database transition boundary
- [x] Reject mutation of approved or executing outbound payloads in PostgreSQL
- [x] Require an exact persisted approval binding before an action may remain executing
- [x] Enforce current runtime policy after atomic lease acquisition and before any provider adapter call
- [x] Persist the policy decision before provider execution and fail closed if decision persistence fails
- [x] Re-check provider write consent and approved payload integrity at the worker boundary
- [x] Preserve idempotency receipt short-circuiting and bind terminal audit metadata to the policy decision hash
- [x] Deterministic allow, emergency-stop, decision-persistence, approval-binding, idempotency, and lease-drift tests
- [x] Pass repository validation on the implementation branch head
- [ ] Apply the approval-binding migration and exercise a live service-role worker against Supabase and provider sandboxes

### P7G — Ambiguous provider execution reconciliation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Classify post-send network and provider-response ambiguity without treating definitive failures as uncertain
- [x] Quarantine ambiguous mail/calendar outcomes and disable blind automatic retry
- [x] Detect provider success followed by terminal receipt-persistence failure
- [x] Persist service-role-only reconciliation cases bound to payload, approval, worker, policy, and provider receipt provenance
- [x] Store only a SHA-256 digest of idempotency keys in reconciliation records
- [x] Resolve from existing local receipts or provider-confirmed outcomes; unknown state requires manual review
- [x] Deterministic ambiguity, binding, receipt-recovery, unknown-outcome, and worker-quarantine tests
- [x] Pass repository validation on the exact final documentation head
- [ ] Apply the reconciliation migration and exercise live Gmail/Microsoft ambiguous-outcome recovery

### P7H — Manual reconciliation adjudication and retry admission — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Deterministic manual-review adjudications bound to action, owner, account, payload, approval, reviewer, and evidence
- [x] Retry eligibility requires explicit provider-confirmed absence evidence
- [x] Confirmed-success adjudication requires a provider receipt identifier
- [x] Retry admission requires unchanged payload, a newer explicit approval revision, and a newly derived idempotency key
- [x] Short-lived retry grants fail closed after expiration
- [x] Service-role-only atomic retry-grant consumption prevents replay
- [x] Owner-readable adjudication evidence with browser writes denied by RLS
- [x] Deterministic integrity, evidence, approval, payload, idempotency, expiry, and no-retry tests
- [x] Pass repository validation on the exact final branch head
- [ ] Apply the adjudication migration and exercise a live manual-review/retry drill against Supabase and provider sandboxes

### P7I — Provider-correlated reconciliation lookups — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Derive one-way SHA-256 provider correlation markers from outbound idempotency keys
- [x] Stamp Gmail replies with deterministic RFC822 Message-ID correlation
- [x] Query Gmail Sent mail by exact `rfc822msgid:` correlation
- [x] Create Microsoft reply drafts with immutable IDs and stamp an exact single-value extended-property correlation marker
- [x] Query Microsoft Sent Items by the exact extended-property id/value pair
- [x] Confirm success only for one exact provider match; duplicate matches fail closed as unknown
- [x] Confirm absence only after a successful zero-match provider query; provider failures never become absence evidence
- [x] Deterministic correlation, provider-query, privacy, duplicate-match, and send-sequence tests
- [ ] Validate live Gmail Message-ID persistence and Microsoft extended-property persistence/search against provider sandboxes

### P7J — Calendar-correlated reconciliation lookups — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Stamp Google calendar create/update/respond mutations with a one-way private extended-property correlation digest
- [x] Stamp Microsoft calendar create/update mutations with an exact single-value extended-property correlation digest
- [x] Query Google and Microsoft calendar creates by exact provider-side correlation with duplicate-match fail-closed behavior
- [x] Reconcile known Google/Microsoft event mutations without treating a missing event as proof of non-execution
- [x] Reconcile Microsoft attendee responses by desired provider state while keeping mismatches manual-review only
- [x] Route calendar reconciliation separately from mail reconciliation by action type
- [x] Keep raw idempotency keys and provider tokens out of reconciliation evidence and query URLs
- [x] Deterministic stamping, lookup, duplicate, missing-resource, desired-state, routing, and provider-error tests
- [x] Pass repository validation on the implementation head (184/184 tests)
- [ ] Validate Google private extended-property and Microsoft event extended-property persistence/search against live provider sandboxes

- [ ] Apply and verify Supabase migrations with service-role boundaries
- [ ] Validate real Google and Microsoft OAuth, sync, pagination, and reconnect behavior
- [ ] Run user-approved OpenAI quality, latency, and cost evaluation
- [ ] Validate browser, phone, desktop, accessibility, and worker recovery behavior
