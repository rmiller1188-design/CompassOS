# P6A Review — Atomic Action Queue and Execution Leases

## Review status

**REVIEWABLE CORE MILESTONE.** GitHub Actions `Validate production core` run 184 completed successfully on branch head `8e4f6bf2964771d42b36b052949a427bd94dc976`. A final validation run is required on this documentation-updated review head before merge consideration.

## Scope

P6A adds the production execution boundary between an explicitly approved outbound action and the existing Gmail, Microsoft mail, Google Calendar, or Microsoft Calendar provider adapters.

The queue claims one approved action atomically, binds the lease to the approved payload hash and payload revision, and moves the action into `executing` before any provider call. Concurrent workers use PostgreSQL `FOR UPDATE SKIP LOCKED`, preventing two workers from claiming the same action.

## Included

- oldest-first atomic action claiming
- bounded worker leases
- payload-hash and payload-revision lease binding
- worker-owned heartbeat extension
- expired lease recovery to `failed`
- service-role-only claim and recovery functions
- client lease-field mutation protection
- provider receipt provenance on success
- structured provider failure and retry metadata
- deterministic unit tests for lease integrity and execution transitions

## Security and reliability invariants

1. Only actions already in `approved` state are claimable.
2. Browser roles cannot acquire, extend, recover, or rewrite execution leases.
3. A changed payload hash or payload revision invalidates the lease.
4. An expired lease fails closed before execution.
5. A crashed worker does not leave an action permanently executable; recovery moves it to `failed`, where the existing lifecycle requires renewed approval before another attempt.
6. Provider credentials remain server-side and are not included in lease objects or audit metadata.
7. No unsupported iMessage database access is introduced.

## Validation target

`npm run validate` syntax-checks the new queue module and runs the complete Node test suite. New tests cover approved-only leasing, payload mutation rejection, expiry rejection, atomic RPC request construction, successful receipt propagation, and failed execution metadata.

## Infrastructure blockers

The Supabase migration has not been applied to a configured project. No multi-worker database contention test, process-crash recovery test, heartbeat timing test, live provider execution, or live audit persistence has run. No live concurrency or provider success is claimed.
