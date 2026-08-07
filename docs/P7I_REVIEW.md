# P7I Review — Provider-Correlated Reconciliation Lookups

Status: **REVIEWABLE CORE / LIVE VALIDATION BLOCKED**

## Goal

Close the provider-evidence gap left by P7G/P7H. Ambiguous outbound mail execution now has a deterministic provider-side correlation mechanism that can distinguish a unique confirmed send, a successful zero-match absence check, and an unsafe/non-unique outcome without exposing the raw execution idempotency key.

## Production changes

### Gmail
- derive a SHA-256 correlation digest from the outbound idempotency key
- stamp the approved MIME reply with a deterministic RFC822 `Message-ID`
- query Gmail Sent mail using `rfc822msgid:` with a maximum of two matches
- accept success only when exactly one provider message is returned
- treat duplicate matches as unknown rather than choosing one
- treat zero matches as absence only when the provider query itself succeeds

### Microsoft 365 / Graph
- switch reply execution to a create-draft, stamp, send sequence
- request Graph immutable IDs for the reply draft
- stamp the draft with a single-value legacy extended property containing only the SHA-256 correlation digest
- send the already-approved draft through the normal `Mail.Send` permission boundary
- query Sent Items by the exact extended-property id/value pair
- accept success only when exactly one sent message matches
- treat duplicate matches as unknown and provider errors as lookup failures, never absence

## Security and correctness invariants

- provider OAuth tokens remain server-side
- lookup URLs never contain bearer tokens
- the raw idempotency key is not used as provider-persisted correlation data
- correlation data is deterministic but one-way
- no provider lookup can bypass approval, runtime policy, reconciliation quarantine, or P7H retry-admission rules
- a zero-result provider lookup cannot authorize retry unless the provider request itself completed successfully
- non-unique matches fail closed
- no unsupported iMessage storage access is introduced
- no fake provider evidence is used in the production path

## Validation

The implementation is covered by deterministic tests for:
- stable correlation generation and raw-key non-disclosure
- Gmail exact-match success
- Gmail duplicate-match fail-closed behavior
- Microsoft extended-property query construction
- successful zero-match absence evidence
- provider failure propagation
- unavailable-adapter fail-closed behavior
- Gmail send marker insertion
- Microsoft immutable draft / extended-property / send sequence

GitHub Actions `Validate production core` passed on the implementation head before documentation finalization. Final reviewable status requires the workflow to pass again on the exact final branch head.

## External API basis

Implementation behavior was checked against current official provider documentation on August 7, 2026:
- Gmail API supports normal Gmail search syntax including `rfc822msgid:` for message/thread listing.
- Microsoft Graph message resources support custom extended properties and filtering messages by a single-value extended property.
- Microsoft Graph supports creating a reply draft and later sending the existing draft.
- Microsoft Graph supports immutable message IDs through the `Prefer: IdType="ImmutableId"` header.

## Infrastructure blockers

No configured Gmail or Microsoft 365 sandbox account is available in this build environment. Provider persistence of the Gmail Message-ID and Microsoft extended property has therefore not been observed live. No live Sent Items lookup, OAuth token refresh during reconciliation, provider throttling drill, or Supabase adjudication/retry flow has been executed. No live provider reconciliation success is claimed.
