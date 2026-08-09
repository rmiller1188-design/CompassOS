# P7X Review — Provider-clock Retry-After hardening

**Status:** REVIEWABLE CORE / LIVE VALIDATION BLOCKED

## Scope

P7X hardens the HTTP-date `Retry-After` boundary introduced through P7V/P7W. P7W preserves absolute retry dates end to end, but delay calculation still relied on the local worker clock. A materially skewed worker clock could therefore turn a valid provider absolute retry date into an unnecessarily long delay or an immediate retry.

## Production behavior

- Delta-seconds `Retry-After` behavior is unchanged.
- For HTTP-date `Retry-After`, a valid provider HTTP `Date` header is now used as the reference clock.
- If the provider `Date` header is missing or malformed, Compass falls back to the existing trusted local reference time.
- The existing 15-minute retry ceiling remains authoritative regardless of provider clock data.
- Provider error bodies remain sanitized through the existing P7V semantics boundary.
- P7T request confinement, P7U response validation, P7Q single-use credentials, and P7R/P7S purpose/account/action binding remain unchanged.

## Why this matters

HTTP-date `Retry-After` is an absolute timestamp. Computing its delay solely from the worker clock assumes worker/provider clock agreement. Provider `Date` gives the response-side reference needed to derive the intended relative delay without granting additional provider authority. This reduces clock-skew sensitivity while retaining bounded scheduling.

## Safety posture

P7X adds no OAuth scope, provider-write authority, browser credential access, approval bypass, retry grant, or resend authority. Provider `Date` influences only a bounded retry delay. It cannot produce reconciliation absence evidence or authorize an outbound action.

Malformed provider `Date` values fail safely to the prior local-clock behavior. All derived delays remain capped at 15 minutes.

## Deterministic validation

The repository validation gate must complete production-core syntax checks and the full deterministic Node test suite on the exact final branch head. Added coverage proves:

- provider `Date` anchors HTTP-date retry delay despite extreme local clock skew;
- malformed provider `Date` falls back to the supplied trusted local reference;
- canonical purpose-bound Google reconciliation preserves the provider-clock-derived bounded delay;
- existing delta-seconds, HTTP-date propagation, sanitization, auth, transient, non-transient, and boundary behavior remains covered.

Exact final GitHub Actions evidence is recorded in draft PR #49 after the final documentation head validates.

## Infrastructure blockers

The following remain unavailable and are not claimed as validated:

- live Google/Microsoft `Date` and `Retry-After` header behavior;
- reverse-proxy or service-mesh mutation of response clock headers;
- materially skewed deployed worker clocks;
- OAuth refresh followed by throttled provider reconciliation;
- service-role Supabase retry scheduling and multi-worker contention;
- the complete live quarantine → refresh → constrained lookup → provider throttle → clock-aware bounded retry flow.

No live provider, network, or database execution success is claimed.
