# CompassOS P5B Review — Approval-Gated Mail Execution and Receipts

## Review scope

This milestone introduces the first provider execution boundary for outbound mail replies. It remains disabled unless a connected account has separately granted the provider-specific send scope and an owner-approved payload passes immutable hash verification immediately before execution.

## Implemented guarantees

- Gmail and Microsoft send consent is distinct from existing read consent.
- The executing action must belong to the requesting user and be in the executing state.
- The current canonical payload must match the payload hash approved by the user.
- Gmail execution constructs a plain-text MIME reply and preserves the provider thread identifier.
- Microsoft execution uses the Graph message reply endpoint.
- Provider tokens are resolved server-side and are not stored in payloads or receipts.
- Every execution uses an idempotency key; an existing receipt prevents duplicate provider execution.
- Provider request identifiers, message identifiers, thread identifiers, failures, and retry hints have explicit persistence contracts.
- Browser roles may read their own receipts but cannot insert, update, or delete execution records.

## Validation

Dependency-free Node tests cover separate consent enforcement, Gmail and Microsoft request construction, secret non-disclosure, ownership and state checks, post-approval mutation rejection, failure auditing, and idempotent duplicate-send prevention. GitHub Actions must pass on the final branch head before this milestone is marked reviewable.

## Security boundary

No send scope is added to the default read-only authorization flow. Consent upgrade remains an explicit future application operation. The execution service fails closed when consent, ownership, approval integrity, account state, provider adapter, or receipt state is invalid.

## Infrastructure blockers

- No live Google or Microsoft send-consent upgrade has been performed.
- No message has been sent through a live provider account.
- The receipt migration has not been applied to a configured Supabase project.
- The concrete encrypted outbound payload store remains dependent on production key and database configuration.

No live-send, deliverability, or database-success claim is made.
