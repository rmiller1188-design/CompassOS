# CompassOS P2A Review — Incremental Mail Sync Core

## Review scope

This milestone introduces the framework-neutral orchestration boundary used by both Gmail history synchronization and Microsoft Graph delta synchronization.

## Implemented guarantees

- A connected account without a durable cursor starts in bootstrap mode.
- A connected account with a durable cursor starts in incremental mode.
- Provider pages are normalized before persistence.
- Message upserts are account-scoped.
- The durable checkpoint advances only after the terminal page completes.
- Repeated request cursors are rejected as a synchronization invariant failure.
- Page count is bounded to prevent unending provider pagination.
- HTTP 401 and invalid-grant failures transition the account to reauthorization-required.
- HTTP 429 and transient provider failures are classified as retryable without silently advancing the cursor.
- Every success or failure emits a sync-run audit record.

## Security boundary

The engine receives an already-authorized account and a server-side provider adapter. It does not expose access or refresh tokens, add write scopes, send mail, modify calendars, or access unsupported iMessage storage.

## Validation

Dependency-free Node tests cover bootstrap pagination, incremental continuation, checkpoint behavior, cursor-cycle rejection, invalid credential handling, and retry classification. GitHub Actions validation must complete successfully before this milestone is marked reviewable.

## Explicit blockers

- Gmail history-list/message-fetch adapter is not implemented in P2A.
- Microsoft Graph delta adapter is not implemented in P2A.
- Supabase message, thread, cursor, retry-queue, and dead-letter adapters are not integrated.
- No live provider or database validation has been claimed.
