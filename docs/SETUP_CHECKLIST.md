# Compass M26 Setup Checklist

Use this order. Do not merge M26 into `main` and do not replace the live static service while any item remains incomplete.

## A. Supabase project

- [ ] Create a new Supabase project dedicated to Compass M26.
- [ ] Record the project URL.
- [ ] Record the publishable key.
- [ ] Record the service-role key and keep it server-only.
- [ ] In Authentication → URL Configuration, set the M26 test deployment as Site URL.
- [ ] Add `http://localhost:3000/auth/callback` to allowed redirect URLs.
- [ ] Add `https://YOUR-M26-HOST/auth/callback` to allowed redirect URLs.

## B. Database migrations

Open the Supabase SQL Editor and run each file from the `m26-connected-accounts` branch in this exact order:

1. [ ] `supabase/migrations/001_m26_tables.sql`
2. [ ] `supabase/migrations/002_m26_functions.sql`
3. [ ] `supabase/migrations/003_m26_rls_storage.sql`
4. [ ] `supabase/migrations/004_m26_security_hardening.sql`
5. [ ] `supabase/migrations/005_m26_atomic_workspace_operations.sql`
6. [ ] `supabase/migrations/006_m26_sync_leases.sql`

After migration 6:

- [ ] `public.workspaces` exists.
- [ ] Storage bucket `compass-files` exists and is private.
- [ ] Browser roles cannot select `public.provider_credentials`.
- [ ] The two server-only workspace RPCs exist.
- [ ] `sync_runs_one_active_per_connection_idx` exists.

## C. Application secrets

From a local checkout of the M26 branch, run:

```bash
npm run secrets
```

Copy the generated values into a password manager or directly into Render:

- [ ] `TOKEN_ENCRYPTION_KEY`
- [ ] `OAUTH_STATE_SECRET`

Never commit either value.

## D. Google data OAuth application

- [ ] Create a Google Cloud project or select the dedicated Compass project.
- [ ] Enable Gmail API.
- [ ] Enable Google Calendar API.
- [ ] Enable People API.
- [ ] Configure the OAuth consent screen.
- [ ] Keep the app in testing while using test accounts.
- [ ] Create an OAuth 2.0 Web application.
- [ ] Add `http://localhost:3000/api/oauth/google/callback`.
- [ ] Add `https://YOUR-M26-HOST/api/oauth/google/callback`.
- [ ] Record `GOOGLE_CLIENT_ID`.
- [ ] Record `GOOGLE_CLIENT_SECRET`.

## E. Microsoft data application

- [ ] Create a Microsoft Entra application registration.
- [ ] Add the Web redirect `http://localhost:3000/api/oauth/microsoft/callback`.
- [ ] Add the Web redirect `https://YOUR-M26-HOST/api/oauth/microsoft/callback`.
- [ ] Add delegated `User.Read`.
- [ ] Add delegated `Mail.Read`.
- [ ] Add delegated `Calendars.Read`.
- [ ] Add delegated `Contacts.Read`.
- [ ] Add `offline_access`, `openid`, `profile`, and `email`.
- [ ] Create a client secret.
- [ ] Record `MICROSOFT_CLIENT_ID`.
- [ ] Record `MICROSOFT_CLIENT_SECRET`.
- [ ] Use `MICROSOFT_TENANT=common` unless Compass should be limited to one tenant.

## F. Optional Supabase social sign-in

Email magic links work without these optional providers.

To enable the Google and Microsoft buttons on the Compass sign-in screen:

- [ ] Enable Google in Supabase Auth Providers.
- [ ] Enable Azure in Supabase Auth Providers.
- [ ] Use `https://PROJECT-REF.supabase.co/auth/v1/callback` as the callback in those separate social-login applications.

These social-login applications are separate from the provider-data applications in sections D and E.

## G. Render M26 test service

Create a new Render service from the `m26-connected-accounts` branch. Do not modify the working static Compass service.

Set:

- [ ] `NEXT_PUBLIC_APP_URL=https://YOUR-M26-HOST`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `TOKEN_ENCRYPTION_KEY`
- [ ] `OAUTH_STATE_SECRET`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `MICROSOFT_CLIENT_ID`
- [ ] `MICROSOFT_CLIENT_SECRET`
- [ ] `MICROSOFT_TENANT=common`
- [ ] Optional `OPENAI_API_KEY`
- [ ] Optional `OPENAI_MODEL`

After the service deploys:

- [ ] `/api/health` returns HTTP 200.
- [ ] Response body contains `"status":"ready"`.

A 503 response is expected until the environment and migrations are complete.

## H. Two-account acceptance test

Account A:

- [ ] Sign in by email magic link.
- [ ] Confirm a private profile and workspace exist.
- [ ] Connect Google and run Sync now.
- [ ] Connect Microsoft and run Sync now.
- [ ] Upload one private file.
- [ ] Create the Us workspace.
- [ ] Invite Account B.

Account B:

- [ ] Sign in using the invited email address.
- [ ] Accept the invitation.
- [ ] Confirm Account A's private messages, events, contacts, and private file are not visible.
- [ ] Confirm explicitly shared Us content is visible.

Account A:

- [ ] Disconnect one provider and confirm imported data remains.
- [ ] Confirm future sync is blocked while disconnected.
- [ ] Reconnect the same account and confirm sync resumes.
- [ ] Start two sync requests together and confirm the second reports that a sync is already running.

## I. Go-live gate

- [ ] Node 22 typecheck passes.
- [ ] ESLint passes.
- [ ] Next.js production build passes.
- [ ] Supabase migrations 001–006 are present in production.
- [ ] Google test authorization passes.
- [ ] Microsoft test authorization passes.
- [ ] Two-account privacy test passes.
- [ ] Private/shared file test passes.
- [ ] Credential-table browser access is denied.
- [ ] Concurrent provider sync is blocked per connection.
- [ ] Rollback to the static service remains available.

Only after every gate passes should the M26 pull request be marked ready or merged.
