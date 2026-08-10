# CompassOS Production Build Roadmap

CompassOS is being built as a production-first personal communications command center spanning supported mail, calendar, contacts, commitments, memory, semantic search, and one OpenAI-powered attention layer. GitHub reviewable milestones are intentionally separated from live-infrastructure validation.

## P0 — Secure account foundation — REVIEWABLE
- [x] Read-only provider scopes, PKCE/state, token-envelope encryption
- [x] Supabase account/token/cursor/action/audit schema and RLS
- [x] Pagination, retry, normalization, and outbound approval primitives

## P1 — Provider OAuth routes — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google and Microsoft authorization, callback, refresh, rotation, disconnect, and audit orchestration
- [ ] Live provider credential validation
- [ ] Live Supabase adapter integration test

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
- [x] Repository validation completed on implementation branch
- [ ] Execute a live canary rollout and rollback drill

### P7E — Runtime outbound-action policy and emergency stops — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Immutable policy snapshots; global/provider/account/action emergency stops
- [x] Expiry/future activation, exact approval payload/revision binding, stale-policy fail-closed behavior
- [x] Deterministic policy decisions and tamper detection
- [ ] Live policy distribution and incident-control surface

### P7F — Policy-enforced execution worker — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Database-bound approval hash/revision and immutable approved/executing payloads
- [x] Runtime policy + provider consent revalidation before provider execution
- [x] Decision persistence before provider call, idempotency receipt handling, terminal audit provenance
- [ ] Apply migration and run live service-role worker/provider sandbox execution

### P7G — Ambiguous provider execution reconciliation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Ambiguous outcome quarantine instead of blind retry
- [x] Reconciliation case provenance, one-way idempotency digest, receipt recovery, manual-review fallback
- [ ] Live ambiguous-outcome fault injection against providers/Supabase

### P7H — Manual reconciliation adjudication and retry admission — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Provider-confirmed absence evidence required for retry eligibility
- [x] Confirmed success requires provider receipt
- [x] Unchanged payload + newer approval + new idempotency key + expiring single-use retry grant
- [x] Service-role-only persistence/RLS boundary
- [ ] Live adjudication/retry drill

### P7I — Provider-correlated mail reconciliation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] One-way SHA-256 correlation markers
- [x] Gmail RFC822 Message-ID and Microsoft immutable draft extended-property correlation
- [x] Exact-match success, successful zero-match absence, duplicate/provider failure fail-closed behavior
- [ ] Live Gmail/Microsoft persistence and search validation

### P7J — Calendar-correlated reconciliation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Google private extended-property and Microsoft event-property correlation
- [x] Conservative create/update/respond reconciliation and attendee-response state verification
- [x] Missing/mismatched provider state cannot authorize retry
- [ ] Live Google/Microsoft calendar correlation validation

### P7K — Reconciliation orchestration and evidence handoff — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Exact action/owner/account/provider/type/payload binding before provider lookup
- [x] Deterministic immutable provider evidence and P7H absence-evidence handoff
- [x] Transient/auth/unknown/success paths fail closed appropriately
- [ ] Apply evidence migration and run full quarantine → lookup → evidence → adjudication flow

### P7L — Reconciliation retry worker and bounded backoff — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Atomic due-case claims, short-lived leases, attempt accounting, bounded exponential backoff/jitter
- [x] Provider Retry-After handling and exhaustion to manual review
- [x] Browser roles denied claim/scheduling/release authority
- [ ] Apply migration and validate multi-worker contention/lease expiry/provider throttling

### P7M — Reconciliation OAuth refresh boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Exact user/account/provider binding before token acquisition
- [x] Existing encrypted server-side refresh/rotation reused
- [x] Transient refresh errors enter bounded retry; permanent/revoked/disconnected states require reconnect/manual review
- [x] Refreshed tokens remain ephemeral and out of retry/evidence results
- [ ] Live Google/Microsoft refresh, revoked consent, and lookup-after-refresh validation

### P7N — Provider session credential containment — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Dedicated contained provider-session credential object
- [x] Raw access token is non-enumerable; routine spread/JSON serialization excludes it
- [x] Explicit `withAccessToken` capability and safe provider/account JSON representation
- [x] Immutable binding and malformed-capability tests
- [x] Repository validation passed on exact reviewable branch head
- [ ] Validate deployed worker/APM behavior

### P7O — Telemetry-safe worker diagnostics boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Add provider-session-aware telemetry sanitizer that never invokes token getters/capabilities
- [x] Redact secret-bearing keys, bearer strings, JWT-like values, and OAuth query parameters
- [x] Replace raw connected-account IDs with deterministic SHA-256 pseudonymous telemetry references
- [x] Bound diagnostic depth/string size and handle circular structures safely
- [x] Serialize `Error` objects through a conservative allowlist rather than arbitrary enumerable fields
- [x] Add explicit worker telemetry event envelope with allowlisted provider/account metadata
- [x] Add deterministic leakage, malformed-session, circular, redaction, and bounded-output tests
- [x] Include telemetry safety module in `npm run validate`
- [x] Exact final head passed GitHub Actions `Validate production core` run 384 with 225/225 tests
- [ ] Validate deployed worker logging/tracing/APM behavior against the application telemetry boundary

### P7P — Capability-only provider credential boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Remove ambient `providerSession.accessToken` access entirely
- [x] Require explicit capability-only credential mode on session assertions and telemetry trust paths
- [x] Fail closed when capability callbacks return nested raw token material
- [x] Replace secret-bearing thrown callback errors with a non-secret boundary error
- [x] Preserve ordinary non-secret provider errors for retry classification
- [x] Add deterministic ambient-access, return-escape, nested collection, thrown-secret, and legacy-session tests
- [x] Exact final head passed GitHub Actions `Validate production core` run 403 with 227/227 tests
- [ ] Validate the capability boundary against live provider adapters and deployed worker instrumentation

### P7Q — Single-use expiring provider credential capabilities — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Consume provider credential capability before provider callback execution
- [x] Reject concurrent and replayed credential-use attempts fail-closed
- [x] Enforce a short-lived capability TTL before provider code can receive a token
- [x] Keep callback failures and credential-escape attempts single-use and non-replayable
- [x] Require single-use capability metadata at telemetry trust boundaries
- [x] Exact final head passed GitHub Actions `Validate production core` run 416 with 230/230 tests
- [ ] Validate expiry/replay behavior with live Google/Microsoft adapters and deployed worker instrumentation

### P7R — Purpose-bound reconciliation provider capabilities — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Wrap contained single-use provider credentials in an immutable exact-purpose/action binding
- [x] Mint reconciliation sessions only for `reconciliation.lookup` and the claimed action id
- [x] Keep purpose subject metadata non-enumerable and out of provider-session JSON serialization
- [x] Fail closed on purpose, subject, provider, or account binding drift
- [x] Include purpose-bound session module in `npm run validate` with deterministic coverage
- [x] Exact final head passed GitHub Actions `Validate production core` run 430 with 234/234 tests
- [ ] Validate live provider adapter consumption against the exact purpose/action binding

### P7S — Purpose-bound reconciliation provider adapters — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Add production-safe Gmail, Microsoft mail, Google Calendar, and Microsoft Calendar reconciliation composition around the exact purpose-bound provider capability
- [x] Assert `reconciliation.lookup`, claimed action id, provider, and connected-account binding before provider HTTP execution
- [x] Keep raw access tokens inside the single-use capability callback and out of reconciliation outcomes/evidence
- [x] Reject purpose/subject/account drift and capability replay before an additional provider request can execute
- [x] Include purpose-bound provider adapter module in `npm run validate` with deterministic mail/calendar coverage
- [x] Exact final head passed GitHub Actions `Validate production core` run 441 with 240/240 tests
- [ ] Validate live Google/Microsoft OAuth → purpose-bound provider lookup consumption and fault injection

### P7T — Reconciliation provider egress confinement — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Constrain Gmail, Google Calendar, Microsoft mail, and Microsoft Calendar reconciliation to exact HTTPS provider origins and supported API path surfaces
- [x] Enforce GET-only, bodyless reconciliation requests and reject URL credentials/fragments before network execution
- [x] Disable automatic redirects and ambient browser credentials at the guarded fetch boundary
- [x] Require bearer authorization and reject unsupported provider/kind egress profiles fail-closed
- [x] Preserve the existing P7S provider-adapter contract while composing the egress guard around every purpose-bound reconciliation request
- [x] Add deterministic origin lookalike, path, method, body, redirect-policy, credential, URL-shape, auth, and route-profile coverage
- [x] Exact final head passed GitHub Actions `Validate production core` run 452
- [ ] Validate live provider redirects, DNS/TLS/proxy behavior, and constrained OAuth → reconciliation execution

### P7U — Reconciliation provider response trust boundary — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Bound provider reconciliation response bodies to 256 KiB before classification
- [x] Reject oversized declared `Content-Length` and stream-count bodies that omit a length
- [x] Reject redirected, off-route, and non-JSON provider responses at the guarded fetch boundary
- [x] Eagerly validate UTF-8 JSON before provider reconciliation can classify zero-match absence
- [x] Preserve status metadata on response-boundary errors for downstream retry/manual-review classification
- [x] Add deterministic oversized, chunked, redirect, final-URL, media-type, malformed-JSON, and valid-response coverage
- [x] Implementation candidate passed GitHub Actions `Validate production core` run 457 with 255/255 tests
- [ ] Validate live Google/Microsoft response headers/streaming behavior, proxy transformations, and provider encoding edge cases

### P7V — Reconciliation provider error semantics — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Sanitize accepted non-2xx provider error messages before orchestration and worker boundaries
- [x] Normalize authentication, rate-limit, transient, and rejected HTTP failures to stable application error codes
- [x] Preserve P7U egress/response boundary failures without reinterpretation
- [x] Cap retry-delay metadata to the existing 15-minute ceiling and keep HTTP 408/425 retry-admissible
- [x] Add deterministic provider-error leakage, classification, and Retry-After parser coverage
- [x] Implementation/package head passed GitHub Actions `Validate production core` run 472 with 261/261 tests
- [ ] Validate live Google/Microsoft error payloads, HTTP-date Retry-After end-to-end, throttling, reconnect, and service-role Supabase execution

### P7W — End-to-end reconciliation Retry-After propagation — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Normalize retry-relevant/auth provider responses immediately after the guarded response boundary
- [x] Preserve HTTP-date and delta-seconds Retry-After through canonical Google/Microsoft purpose-bound reconciliation
- [x] Reuse sanitized stable provider error semantics and the existing 15-minute retry ceiling
- [x] Preserve conservative non-transient 4xx/404 provider reconciliation behavior
- [x] Add deterministic Google 429 and Microsoft 503 HTTP-date propagation coverage
- [x] Implementation candidate passed GitHub Actions `Validate production core` run 481 with 263/263 tests
- [ ] Validate live provider Retry-After/throttling, clock skew, proxy transformations, and service-role retry scheduling

### P7X — Provider-clock HTTP-date Retry-After hardening — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Use a valid provider HTTP `Date` header as the reference clock for HTTP-date `Retry-After`
- [x] Preserve delta-seconds behavior and fall back to the trusted local clock when provider `Date` is absent or malformed
- [x] Retain the existing 15-minute retry ceiling and sanitized provider-error semantics
- [x] Add deterministic extreme-clock-skew, malformed-provider-date, and canonical Google reconciliation coverage
- [x] Include the implementation in the existing production-core validation path
- [ ] Validate live Google/Microsoft response clocks, deployed worker skew, proxy transformations, and service-role retry scheduling

### P7Y — Unified multi-account incremental sync coordinator — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Orchestrate existing mail, calendar, and contacts incremental runners across multiple active Google and Microsoft connected accounts
- [x] Validate duplicate accounts, supported providers/resources, and page limits before provider work
- [x] Isolate account failures so one mailbox/account cannot prevent other connected accounts from progressing
- [x] Short-circuit remaining resources only for the account that requires reauthorization
- [x] Skip inactive accounts before adapter resolution and avoid raw provider error messages in coordinator result envelopes
- [x] Add deterministic multi-account success, partial-failure, reauthorization, inactive-account, adapter-resolution, de-duplication, and fail-closed validation coverage
- [x] Include the coordinator in `npm run validate` and bump package version to 0.42.0
- [ ] Validate live Google/Microsoft multi-account OAuth fanout, cursor persistence, throttling, and deployed scheduler execution

### P7Z — Account-bound multi-account sync persistence — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Resolve persistence separately for each active connected account before mail/calendar/contacts sync runners execute
- [x] Wrap resolved stores in an exact account/provider scope and reject cross-account method calls before the underlying store can run
- [x] Reject raw sync-store object reuse across active accounts within the same fanout run
- [x] Skip inactive accounts before adapter or persistence resolution
- [x] Sanitize and isolate store-resolution failures to the affected account
- [x] Include deterministic account-scope, cross-account rejection, raw-store reuse, and partial-failure coverage
- [x] Include the account-bound store boundary in `npm run validate` and bump package version to 0.43.0
- [ ] Validate live Supabase per-account store resolution, RLS, cursor persistence, and multi-account scheduler execution

### P7AA — Account-scoped sync scheduler leases — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Add service-role-only per-account lease persistence plus atomic claim, heartbeat, and release RPCs
- [x] Bind leases to the exact account/provider/worker/token with a bounded 5-second to 15-minute lease duration
- [x] Allow production scheduler composition to require account leasing fail-closed before any mail/calendar/contacts resource runner executes
- [x] Skip an already-leased account without executing provider resource work and release acquired leases in a `finally` boundary
- [x] Sanitize lease-backend failures and keep them isolated to the affected connected account
- [x] Add deterministic contention, scope-drift, expiry, cleanup, backend-sanitization, and fail-closed composition coverage
- [x] Include the lease module in `npm run validate` and bump package version to 0.44.0
- [ ] Apply the migration and validate live service-role Supabase RLS/RPC behavior, multi-worker contention, heartbeat/expiry recovery, and cursor advancement

### P7AB — Long-running sync lease heartbeat integration — REVIEWABLE CORE / LIVE VALIDATION BLOCKED
- [x] Require acquire/heartbeat/release lease semantics for leased multi-account sync composition
- [x] Renew account ownership before each resource and propagate rotating lease tokens through release
- [x] Renew after every provider page fetch before normalized records or cursor checkpoints can persist
- [x] Convert lease backend/loss failures into sanitized retryable sync-control failures
- [x] Stop remaining resources for only the affected account after lease ownership can no longer be proven
- [x] Add deterministic rotating-token, refreshed-release, cursor non-advancement, lease-loss, and fail-closed composition coverage
- [x] Bump package version to 0.45.0 and include the changed modules in the existing production-core validation chain
- [ ] Validate live Supabase heartbeat rotation, long provider requests, scheduler crash/restart, multi-worker contention, and durable cursor progression

### P7AC — In-flight sync lease guard and provider cancellation — IMPLEMENTATION CANDIDATE / VALIDATION REQUIRED
- [x] Heartbeat while mail, calendar, and contacts provider page reads are still in flight
- [x] Abort the provider read with `AbortSignal` when lease ownership is lost or the heartbeat backend fails
- [x] Propagate cancellation through Gmail, Microsoft mail, Google/Microsoft calendar, and Google/Microsoft contacts HTTP adapters
- [x] Preserve the post-fetch lease heartbeat before normalization, persistence, or cursor advancement
- [x] Bound the default heartbeat cadence below the 5-second minimum account lease duration and reject unsafe intervals fail-closed
- [x] Add deterministic abort, persistence-refusal, signal-propagation, and policy tests
- [x] Bump package version to 0.46.0 and include the lease guard in `npm run validate`
- [ ] Pass exact-head GitHub Actions validation and then mark reviewable
- [ ] Validate live provider cancellation, Supabase heartbeat rotation, long-request behavior, multi-worker contention, and durable cursor progression

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
