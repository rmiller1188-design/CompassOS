# P7C Review — Release Candidate and Promotion Gates

Date: 2026-08-06

## Review status

Core implementation is reviewable after repository validation passes. Live deployment promotion remains infrastructure-blocked.

## Scope

P7C adds a fail-closed release boundary between validated CompassOS source and any staging or production promotion. It does not deploy software or mutate provider data.

### Release candidate manifest

Each candidate is immutably bound to:

- release identifier
- target environment
- Git commit SHA
- build artifact SHA-256 digest
- ordered Supabase migration-manifest SHA-256 hash
- validation evidence-ledger SHA-256 hash
- creation timestamp
- deterministic candidate hash

Any post-creation mutation invalidates candidate integrity and all approvals bound to the prior candidate hash.

### Promotion evaluation

Promotion requires all of the following:

- candidate hash integrity
- passed production-readiness disposition
- exact migration-manifest hash match
- complete, current, passed validation evidence
- exact evidence-ledger hash match
- all selected evidence bound to the candidate commit
- no current rejection
- configured number of unique, current candidate-specific approvals

The output is a deterministic, tamper-detectable promotion report containing the failed control IDs rather than an execution capability.

## Security posture

- No provider credentials, tokens, user content, mail, calendar data, or contact data are accepted.
- No deployment command, provider mutation, or outbound action is available from this module.
- Approvals bind to the complete candidate manifest, not only a release name.
- Stale, future-dated, duplicate, mismatched, or rejected approvals fail closed.
- Missing, blocked, failed, expired, or commit-mismatched evidence prevents promotion.
- No fake production evidence is generated.
- No unsupported iMessage access is introduced.

## Validation coverage

Deterministic tests cover:

- successful fully bound promotion evaluation
- candidate and report hash verification
- candidate mutation and approval invalidation
- migration-manifest mismatch
- evidence-ledger mismatch
- evidence commit mismatch
- blocked readiness and evidence
- approval expiration and rejection
- duplicate approvers
- malformed target, digest, threshold, and report tampering

## Infrastructure blockers

No deployment platform, configured Supabase project, live provider accounts, OpenAI evaluation environment, staging environment, production environment, or release approver integration is available. No live staging or production promotion, rollback, database, provider, model, UX, accessibility, or worker success is claimed.
