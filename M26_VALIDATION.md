# M26 Validation Status

Date: 2026-08-03

## Completed source checks

- Expanded full-stack source is present directly on `m26-connected-accounts`.
- JSON manifests parse.
- TypeScript and TSX syntax parsing completed without syntax errors before the hardening pass.
- Six ordered Supabase migrations are present and checked by `scripts/check-migrations.mjs`.
- Node.js application runtime is 22 or newer.
- Google and Microsoft provider-data OAuth use signed state, provider-specific HttpOnly cookies, and S256 PKCE.
- Provider credentials remain in the encrypted server-only vault.
- Private and shared file paths are separated and enforced through storage policies.
- Workspace creation and invitation consumption are transactional.
- Provider synchronization has one active lease per connection.
- The health endpoint checks required secrets and database readiness.
- iPhone companion and Share extension source scaffolds are present.
- External action requests remain approval-gated and browser roles cannot directly update them.

## Pending external validation

- Public-registry dependency installation.
- TypeScript semantic typecheck after dependency installation.
- ESLint.
- Next.js production build.
- Supabase migrations against a real project.
- Google OAuth test-account authorization.
- Microsoft OAuth test-account authorization.
- Two-account privacy and sharing test.
- Xcode compile, signing, App Group, Keychain group, and TestFlight setup.

No claim is made that Google, Microsoft, OpenAI, Supabase, or iOS functionality is live until the documented credentials, migrations, redirect URLs, and signing settings are configured.

The pull request must remain draft until the external checks pass. The M25.2 static Render service remains the production rollback target.
