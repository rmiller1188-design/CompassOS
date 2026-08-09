# P7W Review — End-to-end reconciliation Retry-After propagation

**Status:** REVIEWABLE CORE / LIVE VALIDATION BLOCKED

## Scope

P7W closes the remaining canonical reconciliation Retry-After propagation gap left by P7V. P7V correctly parses both delta-seconds and HTTP-date Retry-After values, but the legacy provider reconciliation adapter still performed numeric-only conversion before errors reached the canonical purpose-bound reconciliation boundary. That could discard a real provider HTTP-date retry instruction.

## Production behavior

- Provider responses still pass through the P7T request-egress and P7U response-trust boundaries first.
- The purpose-bound reconciliation adapter now intercepts authentication and retry-relevant HTTP statuses (`401`, `403`, `408`, `425`, `429`, and `5xx`) immediately after the guarded response is validated.
- Those responses are converted through the existing P7V sanitized provider-error constructor before the legacy provider adapter can perform numeric-only Retry-After conversion.
- Delta-seconds and HTTP-date Retry-After values therefore survive the canonical Google and Microsoft reconciliation path.
- Provider-directed delay remains capped by the existing 15-minute retry ceiling.
- Ordinary non-transient `4xx` responses remain on the existing provider-specific path so conservative calendar `404` semantics are preserved; a missing calendar resource is still not treated as proof of outbound-action absence.
- Provider-supplied error messages remain outside retry state, orchestration results, and user-visible diagnostics.

## Safety posture

P7W adds no OAuth scope, provider-write authority, browser credential authority, resend authority, or automatic approval path. Existing single-use purpose/account/action-bound credential capabilities, provider egress confinement, response validation, provider error sanitization, reconciliation evidence requirements, retry ceilings, approval binding, idempotency, and audit controls remain in force.

A provider throttle or transient error cannot become provider-confirmed absence evidence and cannot authorize a resend.

## Deterministic validation

Implementation-candidate GitHub Actions `Validate production core` run 481 executed under Node 22.23.1. The repository validation command completed production-core syntax checks and 263 deterministic tests: 263 passed, 0 failed.

The exact final branch head must also pass the same repository gate after this review artifact and roadmap update. The final exact head/run evidence is recorded in draft PR #48.

## Infrastructure blockers

The following remain unavailable and are not claimed as validated:

- live Google and Microsoft Retry-After/throttling behavior
- provider/server clock-skew behavior for HTTP-date Retry-After
- proxy/service-mesh header transformations
- OAuth refresh followed by a throttled reconciliation lookup
- service-role Supabase retry scheduling and multi-worker contention
- the complete live quarantine → OAuth refresh → constrained lookup → provider throttle → bounded retry flow

No live provider, network, or database execution success is claimed.

## Reviewer focus

1. Verify retry-relevant provider responses are normalized only after P7U response validation.
2. Verify HTTP-date retry guidance is bounded before worker scheduling.
3. Verify conservative provider-specific `4xx` behavior, especially calendar `404`, is unchanged.
4. Verify provider messages and bearer credentials cannot escape through the new path.
5. Verify no outbound action gains authority without the existing explicit approval and reconciliation controls.
