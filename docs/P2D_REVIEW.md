# CompassOS P2D Review — Retry Worker and Dead-Letter Operations

## Review scope

This milestone turns persisted retry records into an operable, concurrency-safe worker contract.

## Implemented guarantees

- Retry jobs are claimed atomically with `FOR UPDATE SKIP LOCKED`.
- Each claim receives a bounded lease and stable worker owner.
- Completion and failure updates require the same lease owner.
- Failed jobs use bounded exponential backoff.
- Jobs exceeding the configured attempt ceiling are promoted to an owner-visible dead-letter table.
- Claim execution is restricted to the Supabase service role.
- Browser roles receive no ingestion, claim, or dead-letter mutation policy.
- Worker summaries expose claimed, succeeded, rescheduled, and dead-lettered counts.

## Security boundary

The worker receives server-side jobs and an injected executor. It does not retrieve provider tokens itself, add write scopes, send mail, modify calendars, or access unsupported iMessage storage.

## Validation

The complete dependency-free Node validation suite covers backoff bounds, successful completion, rescheduling, dead-letter promotion, and worker ownership filters. GitHub Actions must pass on the final branch head before this milestone is marked reviewable.

## Explicit blockers

- The migration has not been applied to the live Supabase project in this isolated branch workflow.
- No scheduled Render worker or equivalent production scheduler has been deployed.
- No live Gmail or Microsoft retry job has been executed.
