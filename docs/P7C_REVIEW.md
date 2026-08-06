# P7C Review — Signed Release Attestations

## Status

**Reviewable core milestone; live release authorization remains blocked.**

P7C adds a fail-closed release-attestation boundary. CompassOS can now produce a deterministic release report tied to exact source, migration, validation-evidence, and artifact digests, but it will not sign that report unless production readiness and the evidence ledger are both live-reviewable.

## Included

- release reports bound to a 40-character commit SHA
- ordered artifact inventory with SHA-256 digests and media types
- migration-manifest hash binding
- validation-evidence ledger hash binding
- explicit readiness and evidence dispositions
- deterministic canonical report hashing
- fail-closed blocked reports
- Ed25519 detached signatures with key identifiers
- public-key verification
- post-signature mutation detection
- key-mismatch rejection
- duplicate artifact rejection
- sensitive metadata field rejection

## Security posture

- blocked or incomplete release reports cannot be signed
- private signing keys are input-only and are never included in reports or signatures
- reports contain digests and identifiers, not provider tokens, OAuth secrets, mailbox content, calendar content, or user memory
- sensitive field names are rejected recursively before signing
- artifact names must be unique and every artifact requires a lowercase SHA-256 digest
- signature verification fails after source, evidence, migration, artifact, or disposition mutation
- no provider action or unsupported iMessage path is introduced

## Validation

Repository `npm run validate` syntax-checks the release-attestation module and runs the complete Node test suite. The milestone includes deterministic tests for report eligibility, stable hashing, artifact ordering, blocked-report rejection, Ed25519 signing and verification, mutation detection, wrong-key rejection, duplicate artifacts, malformed digests, and sensitive metadata.

GitHub Actions is the strongest available validation for this branch. The milestone must not be marked reviewable until the final branch head passes `Validate production core`.

## Review focus

1. Confirm readiness and evidence must both be live-reviewable before signing.
2. Confirm the report is bound to commit, migration, ledger, and artifact digests.
3. Confirm signatures fail after any report mutation.
4. Confirm private key material cannot appear in emitted output.
5. Confirm blocked reports remain useful as review artifacts without becoming release authorization.

## Infrastructure blockers

No protected release-signing key, configured Supabase project, live provider accounts, OpenAI evaluation environment, browser/device automation, or deployed worker is available. The current evidence ledger therefore cannot support a live release-candidate signature. No production release authorization, live database, provider, model, UX, accessibility, or concurrency success is claimed.
