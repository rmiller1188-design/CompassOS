# CompassOS P5C Review — Approval-Gated Calendar Actions

## Review scope

This milestone adds the production action boundary for calendar create, update, and invitation-response operations across Google Calendar and Microsoft Graph. It extends the existing outbound approval and receipt model without changing default read-only provider connections.

## Implemented guarantees

- Calendar writes require a separate provider consent upgrade.
- Canonical action payloads cover create, update, accept, tentative, and decline operations.
- Start/end times, attendees, event identity, and response status are validated before approval.
- Payload hashes are deterministic and any post-approval mutation fails closed.
- Field-level diffs expose approval-relevant changes.
- Ownership, action state, account state, consent, adapter identity, and idempotency are checked before execution.
- Gmail/mail-send scopes do not authorize calendar writes and calendar scopes do not authorize mail sends.
- Existing receipts are returned before a repeated provider request is attempted.
- Provider failures retain status, code, and retry delay without exposing tokens.
- Calendar receipt fields extend the owner-readable, service-role-written receipt table.

## Provider behavior

### Google Calendar

- Create through `calendars/{calendarId}/events`.
- Update through event PATCH with `sendUpdates=all`.
- Invitation response through an explicitly approved attendee response patch.

### Microsoft Graph

- Create through `/me/events`.
- Update through `/me/events/{id}` PATCH.
- Respond through native `accept`, `tentativelyAccept`, and `decline` actions.

## Security boundary

Provider tokens are resolved only inside server-side adapters. No token is included in receipts, errors, action payloads, or user-readable audit data. Browser roles receive no receipt mutation policy. Unsupported iMessage storage remains out of scope.

## Validation

Dependency-free Node tests cover canonical hashing, attendee normalization, invalid time ranges, invalid response states, separate consent enforcement, Google and Microsoft request construction, response handling, token non-disclosure, idempotency, approval mutation rejection, and structured failure capture. GitHub Actions must pass on the final branch head before this milestone is marked reviewable.

## Explicit blockers

- No live Google Calendar write-consent upgrade has been exercised.
- No live Microsoft Graph calendar write-consent upgrade has been exercised.
- No production calendar event has been created, modified, accepted, tentatively accepted, or declined.
- The receipt migration has not been applied to a configured Supabase project.
- Phone and desktop approval UX is deferred to P5D after the action contracts are stable.
