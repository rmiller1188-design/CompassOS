# M26 Deployment

M26 must be deployed as a separate test service. Do not replace the working M25.2 static production site until every go-live gate passes.

## Recommended path

1. Create a Supabase project.
2. Apply SQL migrations `001` through `005` in numeric order.
3. Configure Supabase Auth Site URL and allowed app callback URLs.
4. Generate `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET` with `npm run secrets`.
5. Configure the Google data OAuth application.
6. Configure the Microsoft Entra data application.
7. Deploy `m26-connected-accounts` as a **new Render web service** using `render.yaml`.
8. Fill every required environment variable in Render.
9. Verify `https://YOUR-M26-HOST/api/health` returns HTTP 200 with `status: "ready"`.
10. Sign in with an email magic link.
11. Connect one Google test account and run **Sync now**.
12. Connect one Microsoft test account and run **Sync now**.
13. Create the Us workspace and invite a second test account.
14. Test private and shared file uploads from separate accounts.
15. Only after the test deployment passes should M26 be considered for replacing the static service.

## Required Render environment variables

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `OAUTH_STATE_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT`

Optional for the daily AI brief:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Run `npm run check:env` locally before deployment. The health endpoint intentionally returns HTTP 503 when required secrets are missing or the Supabase schema is unavailable.

## Smoke test

- `/api/health` returns HTTP 200 and `status: "ready"`.
- Sign-in email arrives and `/auth/callback` creates a session.
- The first authenticated user has a profile and private workspace.
- Google callback creates one connection and one encrypted credential row.
- Microsoft callback creates one connection and one encrypted credential row.
- Browser roles cannot query `provider_credentials`.
- Sync imports recent email metadata, upcoming events, and contacts.
- Disconnect removes credentials, marks the account disconnected, and preserves imported records.
- Reconnect restores a healthy connection and future synchronization.
- A partner account cannot see another person's private workspace records or private files.
- The Us workspace remains empty until content is explicitly shared.
- Shared files are visible to both members; private files remain owner-only.
- Invitation acceptance is email-bound, one-time, and atomic.
- AI brief returns valid structured JSON when `OPENAI_API_KEY` is configured.

## Rollback

The current static service remains the production rollback target during M26 testing. Do not point its custom domain at the M26 service until database, OAuth, privacy, and two-account smoke tests pass.
