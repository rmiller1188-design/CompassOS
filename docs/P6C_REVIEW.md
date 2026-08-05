# P6C Review — Operational Observability and Recovery

Date: 2026-08-05

## Review status

**Reviewable core milestone.** The implementation is deterministic and isolated from live provider, Supabase, and telemetry infrastructure. Final reviewability depends on the repository validation workflow passing on the final branch head.

## Scope

P6C adds a provider-neutral operational health boundary for Compass AI. It accepts structured signals from sync, AI, approval, and execution subsystems; selects the latest signal per subsystem; derives a fail-safe aggregate state; and produces user-safe recovery guidance.

## Included

- immutable structured health signals
- `healthy`, `degraded`, `blocked`, and `unknown` states
- blocked-over-degraded aggregate precedence
- latest-per-subsystem signal selection
- retry, reconnect, review, and no-op recovery guidance
- recursive secret-key redaction
- bearer-token and email-address redaction
- pseudonymized owner and account identifiers in support exports
- optional explicit account-ID inclusion for authorized support workflows
- deterministic invalid-input rejection

## Security and privacy properties

- Provider tokens and credentials are never required by the health model.
- Keys matching token, secret, authorization, cookie, password, API-key, and PKCE verifier patterns are redacted.
- Bearer credentials and email addresses embedded in diagnostic strings are redacted.
- Support exports pseudonymize owner and account identifiers by default.
- Recovery guidance does not perform retries, reconnects, mail sends, or calendar mutations.
- No unsupported iMessage database access exists.
- No fake data is used in the production path.

## Validation target

`npm run validate` syntax-checks the new operations module and runs the complete Node test suite. P6C tests cover aggregation precedence, latest signal selection, recovery decisions, recursive redaction, support-export pseudonymization, secret non-disclosure, and malformed-input rejection.

## Infrastructure blockers

No live telemetry pipeline, Supabase health persistence, Google or Microsoft reconnect flow, production support export, browser recovery surface, or alert delivery was exercised. No live operational, provider, database, or support-workflow success is claimed.

## Review focus

1. Confirm the health-state vocabulary is sufficient for sync, AI, approval, and execution subsystems.
2. Confirm reconnect takes precedence over retry when both flags are present.
3. Confirm support exports remain useful after default pseudonymization and redaction.
4. Confirm no recovery action can directly cross the approval or provider-execution boundary.
