# P7B Review — Validation Evidence Ledger

## Status

**Reviewable core milestone; live infrastructure evidence remains blocked.**

P7B adds a deterministic evidence ledger for production controls. It prevents CompassOS from treating stale, missing, or failed validation evidence as production-ready.

## Included

- required-control registry input with duplicate rejection
- normalized validation evidence for CI, staging, and production
- latest-evidence selection per control
- explicit expiration handling
- fail-closed missing-evidence behavior
- failed-over-blocked disposition precedence
- commit, workflow-run, and artifact-digest provenance fields
- deterministic per-entry evidence hashes
- deterministic whole-ledger hash and tamper verification
- deterministic tests for completeness, freshness, precedence, malformed input, and tampering

## Security and privacy posture

- evidence records contain identifiers and digests, not credentials or provider tokens
- missing or expired evidence is blocked rather than passed
- failed evidence cannot be masked by older passed evidence
- no provider action, mailbox/calendar/contact access, or unsupported iMessage path is introduced
- no fake production evidence is generated

## Validation

Repository `npm run validate` syntax-checks the new module and runs the complete Node test suite. GitHub Actions is the strongest available validation for this branch.

## Review focus

1. Confirm required controls fail closed when evidence is absent.
2. Confirm expired evidence cannot satisfy readiness.
3. Confirm latest evidence selection and failed precedence.
4. Confirm ledger hashing detects mutation.
5. Confirm evidence metadata contains no secret values.

## Infrastructure blockers

No configured Supabase project, provider OAuth credentials, live sync accounts, OpenAI evaluation environment, browser/device test environment, or deployed worker is available. Therefore the ledger contains no live production evidence, and no live database, provider, model, UX, accessibility, or concurrency success is claimed.
