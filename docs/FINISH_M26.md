# Finish Compass M26

The code, database migrations, security hardening, CI validation, Supabase provisioning logic, Render configuration logic, deployment trigger, and health verification are automated.

No password, API key, OAuth client secret, database password, or provider token should be pasted into ChatGPT, committed to the repository, or placed in a public issue.

## What the Finish M26 workflow does

When authorized, `.github/workflows/finish-m26.yml` will:

1. Check out `m26-connected-accounts`.
2. Validate all six Supabase migrations and the provisioning script.
3. Select or create the `CompassOS-M26` Supabase project.
4. Wait until the project is healthy.
5. Link the repository to the project.
6. Apply migrations `001` through `006` in order.
7. Configure the production and local Supabase Auth callback URLs.
8. Retrieve the project publishable and server keys without printing them.
9. Refuse to modify the working `compass-os` static Render service.
10. Configure the separate `compass-os-m26` Render web service.
11. Preserve existing token-encryption secrets on reruns.
12. Configure all server environment variables.
13. Trigger a Render deployment.
14. Poll `/api/health` until M26 reports `ready`.

## Account-owner authorization required

These are account-level authorizations. They cannot be created by repository code without the account owner's approval.

### Supabase repository secrets

Create these under:

`CompassOS → Settings → Secrets and variables → Actions → New repository secret`

- `SUPABASE_ACCESS_TOKEN`
  - Create it in Supabase Account Settings → Access Tokens.
  - It must be allowed to create/manage projects and Auth configuration.
- `SUPABASE_DB_PASSWORD`
  - Use a new strong database password dedicated to Compass M26.
  - Store it in a password manager.

The workflow automatically selects the organization when the Supabase account belongs to one organization. If there are multiple organizations, supply the organization slug when running the workflow.

### Render repository secrets

- `RENDER_API_KEY`
  - Create it in Render Account Settings → API Keys.
- `RENDER_M26_SERVICE_ID`
  - Optional when supplied as the workflow input instead.
  - This must identify a separate web service named `compass-os-m26`.
  - Never use the ID of the working `compass-os` static service.

Create the separate service from the repository Blueprint first:

`https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Frmiller1188-design%2FCompassOS`

Confirm the Blueprint selects the `m26-connected-accounts` branch and creates `compass-os-m26` as a Node web service.

### Google provider-data OAuth secrets

Create a Google OAuth 2.0 Web application dedicated to Compass provider data. Enable Gmail API, Google Calendar API, and People API.

Add these redirect URIs:

- `http://localhost:3000/api/oauth/google/callback`
- `https://compass-os-m26.onrender.com/api/oauth/google/callback`

Add repository secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Keep the Google consent screen in testing mode until the test accounts pass. Gmail read-only access can require Google verification before general production use.

### Microsoft provider-data OAuth secrets

Create a Microsoft Entra Web application with these delegated permissions:

- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`
- `Mail.Read`
- `Calendars.Read`
- `Contacts.Read`

Add these redirect URIs:

- `http://localhost:3000/api/oauth/microsoft/callback`
- `https://compass-os-m26.onrender.com/api/oauth/microsoft/callback`

Add repository secrets:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT` with value `common` unless one tenant is required

### Optional OpenAI secrets

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

The connected-account application works without the AI daily brief. The brief endpoint returns `ai_not_configured` until an API key is set.

## Run the workflow

1. Open GitHub Actions.
2. Select **Finish Compass M26**.
3. Click **Run workflow**.
4. Keep `target_branch` as `m26-connected-accounts`.
5. Confirm `app_url` is the separate M26 Render URL.
6. Leave `project_ref` blank to create or reuse the project by name.
7. Leave `org_slug` blank when the Supabase account has one organization.
8. Keep region `us-west-2` for the Pacific Northwest.
9. Supply the separate Render service ID if it is not stored as a repository secret.
10. Run the workflow.

A successful run ends with:

- Supabase project healthy
- Six migrations applied
- Auth redirects configured
- Render environment configured
- Render deploy triggered
- `/api/health` returning `{"status":"ready"}`

## Safety behavior

The automation intentionally fails rather than:

- touching a static Render service
- touching a Render service not named `compass-os-m26`
- rotating an existing token-encryption key
- exposing Supabase or provider keys in logs
- deploying without the required Google and Microsoft OAuth credentials
- continuing when migrations or health verification fail

The M26 pull request must remain draft until real Google, Microsoft, two-account privacy, and shared-workspace acceptance tests pass.
