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

## Security model

- Provider passwords are never collected.
- Google/Microsoft OAuth tokens are encrypted server-side.
- Token ciphertext is stored in `provider_credentials`, which is not readable by authenticated clients.
- Every user owns a private workspace.
- A shared workspace contains only deliberately shared objects.
- Google and Microsoft connections begin read-only.
- Send, calendar-write, and financial actions remain disabled until an explicit approval workflow is implemented.

## Local setup

1. Create a Supabase project.
2. Run all SQL files in `supabase/migrations` in numeric order.
3. Copy `.env.example` to `.env.local`.
4. Generate secrets:

```bash
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32      # OAUTH_STATE_SECRET
```

5. Configure Google and Microsoft OAuth using `docs/OAUTH_SETUP.md`.
6. Install and run:

```bash
npm install
npm run dev
```

7. Open `http://localhost:3000`.

## Render deployment

Create a separate Render Blueprint deployment from the M26 branch after the environment variables are configured. Do not point the existing live static service at M26 until the Supabase migrations and OAuth callbacks are ready.

See `docs/DEPLOYMENT.md`.

## iPhone companion

See `ios/Compass/README.md`. The Share extension accepts only content the user explicitly selects through the iOS Share Sheet. It does not read historical iMessage conversations.

## Prototype limitations still present

- Thread detail and reply drafting UI is scaffolded but not fully implemented.
- Provider webhooks and incremental sync tokens are not yet enabled.
- Google/Microsoft write scopes are intentionally not requested.
- Native iOS sign-in handoff still needs the Xcode project and universal-link flow.
- Real financial accounts and transfers are not connected.
