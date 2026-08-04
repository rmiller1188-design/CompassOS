# CompassOS P2C Review — Supabase Mail Persistence

## Review scope

This milestone connects the validated provider-neutral synchronization engine to an account-bound Supabase persistence adapter and adds the database structures required for normalized messages, threads, sync runs, and retry visibility.

## Implemented guarantees

- Every store instance is bound to one authenticated user and one connected account.
- Cross-account cursor, message, audit, and status writes are rejected before a database request is issued.
- Generic mail cursors map to `gmail_history` or `graph_mail_delta` according to the bound provider.
- Message upserts are idempotent on account plus provider message ID.
- Thread summaries are derived from normalized message batches and remain account-scoped.
- Cursor advancement resets failure metadata only after the synchronization engine reaches a terminal provider page.
- Retryable failures create visible retry jobs with provider-directed delay handling.
- Invalid credentials transition only the bound account to `reauth_required`.
- RLS permits owners to read their data while ingestion writes remain service-role-only.

## Validation

The dependency-free test suite covers provider cursor mapping, normalized message and thread persistence, cross-account rejection, retry scheduling, and constrained reauthorization updates. GitHub Actions must pass on the branch head before this milestone is marked reviewable.

## Explicit blockers

- The migration has not been applied to a live Supabase project.
- No live provider mailbox has been synchronized into Supabase.
- Retry worker leasing, execution, attempt limits, and dead-letter promotion remain a subsequent production milestone.
- Provider registrations, test accounts, Supabase URL, and service-role credentials are not stored in the repository.
