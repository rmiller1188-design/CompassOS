# M26 Validation Status

Date: 2026-08-03

## GitHub CI — PASS

Validated on Node.js 22 against the public npm registry:

- dependency installation: PASS
- six ordered Supabase migrations: PASS
- TypeScript semantic typecheck: PASS
- ESLint: PASS
- Next.js production build: PASS

Successful workflow:

- `Validate M26 Pull Request`
- run `#57`
- head `056170affa27ed2a7fa74d5d64297e02e9c1f66d`

## Completed source checks

- Expanded full-stack source is present directly on `m26-connected-accounts`.
- Six ordered Supabase migrations are present and checked by `scripts/check-migrations.mjs`.
- Google and Microsoft provider-data OAuth use signed state, provider-specific HttpOnly cookies, and S256 PKCE.
- Provider credentials remain in the encrypted server-only vault.
- Private and shared file paths are separated and enforced through storage policies.
- Workspace creation and invitation consumption are transactional.
- Provider synchronization has one active lease per connection.
- The health endpoint checks required secrets and database readiness.
- iPhone companion and Share extension source scaffolds are present.
- External action requests remain approval-gated and browser roles cannot directly update them.

## Pending environment validation

- Supabase migrations against a real project.
- Google OAuth test-account authorization.
- Microsoft OAuth test-account authorization.
- Two-account privacy and sharing test.
- Render M26 test-service readiness.
- Xcode compile, signing, App Group, Keychain group, and TestFlight setup.

No claim is made that Google, Microsoft, OpenAI, Supabase, Render M26, or iOS functionality is live until the documented credentials, migrations, redirect URLs, and signing settings are configured.

The pull request must remain draft until the environment checks pass. The M25.2 static Render service remains the production rollback target.
