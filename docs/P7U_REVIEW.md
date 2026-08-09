# P7U Review — Reconciliation provider response trust boundary

## Status

**REVIEWABLE CORE / LIVE VALIDATION BLOCKED once the final documentation head passes the repository gate.**

P7U extends P7T's request-side egress confinement with a response-side trust boundary. The goal is narrow: provider reconciliation may only classify evidence after a bounded, route-consistent, non-redirected JSON response has been validated. A malformed or unexpectedly large successful response must never be interpreted as a successful zero-match query.

## Production behavior

- Gmail, Google Calendar, Microsoft mail, and Microsoft Calendar reconciliation responses are capped at 256 KiB.
- Declared `Content-Length` above the ceiling is rejected before body decode.
- Responses without `Content-Length` are read through the body stream with cumulative byte accounting and cancelled once the ceiling is exceeded.
- Provider-supplied `Content-Type` must be JSON-compatible.
- Redirected/opaque-redirect responses are rejected.
- A final response URL, when present, is revalidated against the exact P7T HTTPS origin and API-path allowlist.
- JSON is parsed eagerly as UTF-8 before the provider lookup receives the response, so malformed successful payloads cannot fall through to zero-match absence handling.
- Response-boundary errors preserve HTTP status when available so the existing worker can retain conservative retry/manual-review classification.

## Security and reliability properties preserved

P7U adds no OAuth scopes and no outbound-write authority. Raw access tokens remain inside the P7Q/P7R/P7S single-use purpose-bound capability path. Purpose, action subject, provider, and account drift still fail closed before provider HTTP execution. Existing reconciliation evidence/adjudication, bounded retry admission, explicit approval, runtime action policy, idempotency, and audit controls are unchanged.

No unsupported iMessage database access is introduced. No fake provider or Supabase evidence exists in the production path.

## Deterministic coverage

The P7U tests cover:

- fixed response-size policy exposure;
- oversized declared response rejection before decode;
- oversized streamed/chunked response rejection without `Content-Length`;
- non-JSON media-type rejection;
- redirect rejection;
- final response origin revalidation;
- malformed HTTP 200 JSON failing before reconciliation can return `not_found`;
- successful small Gmail reconciliation remaining compatible.

GitHub Actions `Validate production core` implementation candidate run 457 passed under Node 22.23.1 with **255 tests passed, 0 failed**, plus production-core syntax checks. The exact final documentation/source head must pass the same gate before this milestone is reported reviewable.

## Infrastructure blockers

The following are not claimed as validated:

- live Gmail/Google Calendar/Microsoft Graph response header behavior;
- live chunked/streamed provider response limits and cancellation behavior;
- reverse-proxy, service-mesh, DNS, or TLS transformations;
- provider charset/content-encoding edge cases;
- OAuth refresh/rotation followed by constrained response validation;
- service-role Supabase execution and the complete quarantine → refresh → purpose-bound constrained lookup → response validation → evidence → adjudication flow.

These require configured provider and Supabase infrastructure. No live provider, network, or database success is claimed.

## Review focus

Review should concentrate on whether the 256 KiB ceiling is operationally appropriate for the intentionally narrow reconciliation queries, whether final-URL and media-type handling are conservative enough without breaking normal provider responses, and whether malformed-success responses are definitively prevented from creating provider-confirmed absence evidence.
