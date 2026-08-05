# P7A Review — Production Readiness Gates

## Status

**Reviewable core milestone; live infrastructure validation remains blocked.**

P7A adds a deterministic, fail-closed readiness boundary before CompassOS can claim live production integration. The module does not connect to Supabase, Google, Microsoft, or OpenAI and does not expose configured secret values.

## Included

- server-only runtime configuration requirements for Supabase, token encryption, Google, Microsoft, and OpenAI
- provider-specific configuration checks based on explicitly enabled integrations
- detection of sensitive values placed under public client environment prefixes
- non-string and unsupported-provider configuration rejection
- ordered Supabase migration manifest validation
- duplicate and out-of-order migration detection
- deterministic SHA-256 migration-manifest evidence
- explicit `passed`, `blocked`, and `failed` validation states
- production disposition separating infrastructure blockers from validation failures
- deterministic tests covering configuration completeness, secret non-disclosure, migration integrity, malformed input, and blocker classification

## Security and privacy posture

- readiness output contains key-name fingerprints, never secret values
- public environment prefixes containing tokens, secrets, service-role credentials, or API keys fail closed
- missing provider configuration cannot be interpreted as success
- unsupported providers are rejected rather than silently ignored
- no provider tokens, mail, calendar, contacts, messages, memory, or user content are accessed
- no outbound provider action path is introduced
- no unsupported iMessage access

## Validation

The repository validation command syntax-checks `src/operations/production-readiness.js` and runs the complete Node test suite. GitHub Actions is the strongest available validation for this branch.

## Review focus

1. Confirm the required runtime key set matches the intended deployment boundary.
2. Confirm public-prefix detection fails closed without revealing values.
3. Confirm migration ordering and manifest hashing are deterministic.
4. Confirm blocked infrastructure is not reported as a passed live validation.
5. Confirm no execution or provider-write path was added.

## Infrastructure blockers

No configured Supabase project, service-role integration, Google or Microsoft OAuth credentials, live mailbox/calendar/contact data, OpenAI evaluation key, browser automation, physical-device pass, or worker deployment is available in this milestone. No live database, provider, model, UX, or concurrency success is claimed.
