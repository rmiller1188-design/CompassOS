# M26 Deployment

## Recommended path

1. Create a Supabase project.
2. Apply all SQL files in `supabase/migrations` in numeric order.
3. Configure Supabase Auth redirect URLs.
4. Configure Google and Microsoft OAuth callback URLs.
5. Deploy the `m26-connected-accounts` branch as a **new** Render service using `render.yaml`.
6. Fill every `sync: false` environment variable in Render.
7. Verify `/api/health`.
8. Sign in with email magic link.
9. Connect one Google test account and run Sync now.
10. Connect one Microsoft test account and run Sync now.
11. Create the Us workspace and invite the partner test account.
12. Only after the test deployment passes should M26 replace the static production service.

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
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

## Smoke test

- `/api/health` returns status `ok`.
- Sign-in email arrives and callback creates a session.
- A profile and personal workspace exist.
- Google callback creates one connection and encrypted vault row.
- Microsoft callback creates one connection and encrypted vault row.
- Sync imports email metadata, upcoming events, and contacts.
- Browser clients cannot query `provider_credentials`.
- A partner account cannot see private workspace records.
- The Us workspace is empty until content is explicitly shared.
- File upload succeeds and the object is inaccessible without membership.
- AI brief returns valid structured JSON.
