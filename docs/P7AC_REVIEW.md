# P7AC Review — In-flight sync lease guard and provider cancellation

Status: REVIEWABLE CORE / LIVE VALIDATION BLOCKED.

## Purpose
P7AB renewed account-scoped sync leases before each resource and after each provider page fetch. A provider read could still remain in flight longer than the minimum lease duration, creating a window where ownership might expire before the worker observed loss. P7AC closes that gap for the production read-side sync path.

## Changes
- Added `src/sync/lease-guarded-operation.js` with a bounded periodic heartbeat loop around in-flight provider reads.
- Mail, calendar, and contacts incremental runners now execute page fetches through the lease guard when a lease heartbeat capability is present.
- Lease heartbeat failure aborts the provider request through `AbortController` and rejects with the original sanitized lease-control failure.
- Gmail, Microsoft mail, Google Calendar, Microsoft Calendar, Google People, and Microsoft contacts adapters forward the exact `AbortSignal` to their HTTP fetch implementation.
- The existing post-fetch heartbeat remains in place before normalization, upsert, or cursor checkpoint persistence.
- Default heartbeat cadence is 2 seconds and is fail-closed outside 250 ms–4 seconds, below P7AA's 5-second minimum account lease duration.
- Added deterministic coverage for abort-on-lease-loss, persistence refusal, provider signal propagation, policy bounds, and unsafe interval rejection.

## Safety properties
- No new OAuth scopes or provider-write capabilities.
- No browser token surface or client-side credential authority.
- Provider read completion after lease loss cannot advance normalized persistence or sync cursors through the guarded runner path.
- Lease failures retain retryable sync-control semantics and do not expose backend diagnostics through coordinator result envelopes.
- No unsupported iMessage access and no fake provider/database evidence.

## Validation
The implementation/source candidate passed GitHub Actions `Validate production core` run 564 under Node 22.23.1 with 297/297 deterministic tests passing and zero failures. The final documentation-status head is required to pass the same validation gate before P7AC is reported externally as reviewable.

## Live validation blockers
- Real Google/Microsoft abort/cancellation behavior and connection teardown.
- Supabase service-role lease heartbeat rotation, RLS/RPC behavior, and durable cursor persistence.
- Provider calls that exceed the configured lease interval under real latency/throttling.
- Scheduler crash/restart recovery and true multi-worker contention.
- Network/proxy behavior when an AbortSignal is raised during a provider response.

No live provider, Supabase, network, or deployed scheduler success is claimed by this artifact.
