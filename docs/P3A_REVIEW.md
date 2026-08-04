# CompassOS P3A Review — Incremental Calendar Synchronization

## Scope

This milestone adds the read-only calendar synchronization boundary for Google Calendar and Microsoft 365 calendars.

## Implemented guarantees

- Calendar synchronization selects bootstrap or incremental mode from the durable account cursor.
- Provider pages are bounded and repeated request cursors are rejected.
- Events are normalized before persistence.
- Durable cursors advance only after the terminal provider page completes.
- Google Calendar bootstrap uses page tokens and commits a next sync token.
- Google incremental requests require and preserve a sync token.
- Microsoft Graph uses calendarView delta and preserves opaque nextLink and deltaLink URLs.
- Provider authorization, throttling, transient, and invariant failures use the existing synchronization failure contract.
- Expired authorization can transition the connected account to reauthorization-required.

## Security boundary

The adapters receive access tokens only through a server-side resolver. They request read-only calendar data and do not create, modify, accept, decline, or delete events. No outbound action bypasses the approval system.

## Validation

`npm run validate` syntax-checks the full production core and runs deterministic tests covering Google bootstrap and incremental behavior, Microsoft delta continuation, event normalization, and terminal checkpoint persistence. This milestone is reviewable only after GitHub Actions succeeds on the final branch head.

## Infrastructure blockers

- No live Google Calendar test account has been authorized.
- No live Microsoft 365 calendar has been synchronized.
- Supabase event persistence and RLS integration are deferred to the next isolated milestone.
- Provider registrations and production scheduler configuration are not stored in the repository.
