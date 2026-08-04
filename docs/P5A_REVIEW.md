# CompassOS P5A Review — Reply Drafting and Approval Integrity

## Review scope

This milestone introduces reply drafting and approval-integrity primitives without enabling provider send scopes or outbound execution.

## Implemented guarantees

- OpenAI reply drafting is server-side, uses strict JSON Schema structured output, and sets `store: false`.
- Drafts may cite only message IDs supplied in the normalized thread boundary.
- Reply recipients are normalized and deduplicated before approval.
- The complete outbound intent is represented by a canonical payload and deterministic SHA-256 hash.
- Field-level diffs expose edits to recipients, subject, body, provenance, and attachments.
- Any payload mutation after approval invalidates the approval hash and requires a new approval.
- Incomplete reply intents without recipients, body text, or provenance are rejected.
- No provider send call, write scope, or automatic execution path exists in this milestone.

## Security boundary

OpenAI credentials remain server-side. Provider credentials are not passed into the drafting layer. The model output remains advisory. Existing provider connections remain read-only, and unsupported iMessage database access is not introduced.

## Validation

`npm run validate` syntax-checks the production core and runs deterministic tests covering structured request shape, `store: false`, source-message provenance, recipient normalization, stable hashing, field-level diffs, incomplete payload rejection, and post-approval mutation rejection. The milestone must not be marked reviewable until GitHub Actions succeeds on the final branch head.

## Explicit blockers

- A live OpenAI API key and user-approved reply-quality evaluation set are not configured.
- Encrypted outbound payload persistence is not yet integrated with Supabase.
- Gmail and Microsoft send scopes remain intentionally absent.
- Gmail and Microsoft execution adapters and provider receipts are deferred to P5B.
