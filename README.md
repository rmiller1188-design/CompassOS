# Compass OS M26 — Connected Accounts

M26 is the first full-stack Compass implementation. It keeps the condensed five-destination product model:

- Home
- Messages
- Calendar
- Us
- Search

The existing M25.2 static prototype remains on `main`. M26 is developed on `m26-connected-accounts` until the backend and OAuth configuration are validated.

## What is implemented

- Supabase authentication with magic link and optional Google/Microsoft sign-in
- Separate private profile and personal workspace for every user
- Shared `Us` workspace with invitation and acceptance flow
- Google OAuth connection for Gmail, Calendar, and Contacts read access
- Microsoft OAuth connection for Outlook Mail, Calendar, and Contacts read access
- AES-256-GCM encrypted provider credential vault
- Google and Microsoft first-sync endpoints
- Unified normalized tables for messages, events, and people
- Supabase Storage file uploads with workspace-scoped RLS
- iPhone `/api/share-intake` endpoint
- SwiftUI companion app and Share extension scaffold
- OpenAI Responses API private daily brief with `store: false` and strict JSON schema output
- External action approval table for future send/write/financial operations
- Render Node deployment Blueprint
- One-click owner-authorized Supabase and Render provisioning workflow

## Security model

- Provider passwords are never collected.
- Google/Microsoft OAuth tokens are encrypted server-side.
- Token ciphertext is stored in `provider_credentials`, which is not readable by authenticated clients.
- Every user owns a private workspace.
- A shared workspace contains only deliberately shared objects.
- Google and Microsoft connections begin read-only.
- Send, calendar-write, and financial actions remain disabled until an explicit approval workflow is implemented.

## Automated completion

The default branch exposes **Actions → Finish Compass M26**. After account-owner secrets are stored directly in GitHub, the workflow:

1. Creates or reuses the Supabase project.
2. Applies migrations `001` through `006`.
3. Configures Supabase Auth redirects.
4. Retrieves project keys without printing them.
5. Refuses to touch the working static Render service.
6. Configures the separate `compass-os-m26` web service.
7. Preserves encryption secrets across reruns.
8. Deploys M26 and waits for `/api/health` to report `ready`.

See `docs/FINISH_M26.md` for the owner-authorization handoff. Do not paste secrets into chat or commit them to the repository.

## Local setup

1. Create a Supabase project or use the automated workflow.
2. Run all SQL files in `supabase/migrations` in numeric order.
3. Copy `.env.example` to `.env.local`.
4. Generate secrets with `npm run secrets`.
5. Configure Google and Microsoft OAuth using `docs/OAUTH_SETUP.md`.
6. Install and run:

```bash
npm install
npm run dev
```

7. Open `http://localhost:3000`.

## Render deployment

Create a separate Render deployment for `compass-os-m26` from the M26 branch. Do not point the existing live static service at M26 until the Supabase migrations and OAuth callbacks are ready.

See `docs/DEPLOYMENT.md` and `docs/FINISH_M26.md`.

## iPhone companion

See `ios/Compass/README.md`. The Share extension accepts only content the user explicitly selects through the iOS Share Sheet. It does not read historical iMessage conversations.

## Validation

The validated M26 branch passes:

- six-migration ordering checks
- npm dependency installation on Node 22
- TypeScript typecheck
- ESLint
- Next.js production build
- provisioning-script syntax validation

See `M26_VALIDATION.md`.

## Remaining external requirements

- Supabase account authorization
- Google OAuth application and testing users
- Microsoft Entra application and testing users
- Separate M26 Render service authorization
- Two-account privacy and sharing acceptance test
- Apple/Xcode project creation, signing, App Group, and Keychain setup
- Google verification before broad Gmail production access, where required
