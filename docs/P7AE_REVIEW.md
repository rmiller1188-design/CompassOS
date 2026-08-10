# P7AE — Sync Failure Persistence Safety Boundary

## Review scope
P7AE closes a persistence-side diagnostic leakage path in production sync execution. Before this increment, mail, calendar, and contacts runners could pass arbitrary provider or invariant error text into `sync_runs.message`, and retryable failures could copy the same text into `sync_retry_jobs.last_error`. Those records are durable and owner-readable, so provider-controlled diagnostics, bearer material accidentally embedded in an exception, opaque provider cursors, URLs, email addresses, or other unintended values could cross a boundary that the existing telemetry layer already treats as untrusted.

P7AE introduces a canonical persistence-safe failure record. Failed synchronization is represented only by an allowlisted reason, a stable application-owned message, and—when retryable—a bounded retry delay. Raw exception text remains available only to in-process control flow and is not part of the durable failure record.

## Production changes
- New `src/sync/sync-failure-safety.js` canonicalizes failed sync persistence.
- Mail, calendar, and contacts runners convert classified failures to the safe record before `recordSync`.
- The Supabase sync store repeats the conversion at the persistence boundary as defense in depth.
- Unknown reason strings fail closed to `sync_failure` / `Synchronization failed`.
- Retry delay metadata is bounded to 1 second through the existing 15-minute ceiling before durable scheduling.
- `sync_runs.message` and retry `last_error` receive stable application-owned text only.
- The original thrown error is still rethrown to preserve worker/coordinator control flow.
- Package version is `0.48.0`, and the new module is part of `npm run validate`.

## Security and authority posture
This increment adds no OAuth scope, provider-write authority, browser credential access, outbound-action bypass, unsupported iMessage access, or fake production data. It does not change approval, policy, idempotency, reconciliation, lease, or cursor-fencing authority. Supabase RLS/service-role requirements and user-controlled memory remain unchanged.

The boundary is intentionally independent from best-effort string redaction: arbitrary provider messages are not cleaned and persisted; they are discarded and replaced with an application-owned semantic class. This reduces dependence on token/email/cursor pattern recognition at a durable storage boundary.

## Deterministic validation
The implementation candidate `f63c639b1c044499e290eafedf80e14dbe89eccb` passed GitHub Actions `Validate production core` run 591 against exact P7AD base `73215a969a6a4f90b2f08bdde124d1b18cfe4cc8`. Node 22.23.1 completed the syntax chain and 308/308 deterministic tests passed with zero failures. The six new P7AE tests passed as tests 275–280.

The milestone is reviewable only after the commit containing this review artifact also passes the same pull-request validation gate. Draft PR #56 is the authoritative exact-head validation record.

## Review checklist
- Verify no raw `error.message` is passed into durable sync-run persistence by mail, calendar, or contacts runners.
- Verify the Supabase store re-canonicalizes failed runs instead of trusting caller-provided failure text.
- Verify retry `last_error` uses the stable safe message and retry delay remains bounded.
- Verify unknown reason strings cannot become durable arbitrary text.
- Verify original errors continue to propagate in process so existing coordinator behavior is not silently changed.
- Verify no new provider or outbound authority is introduced.

## Infrastructure blockers
Not validated live in this build context: real Google/Microsoft error payloads, configured Supabase persistence and owner-visible RLS behavior, deployed logging/APM capture, real retry-worker persistence/consumption, and end-to-end provider fault injection. No live provider, Supabase, network, or deployed-runtime success is claimed.