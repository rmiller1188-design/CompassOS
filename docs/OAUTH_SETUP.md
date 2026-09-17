# M26 OAuth Setup

Compass uses two separate authorization layers. Do not reuse or confuse their redirect URLs.

1. **Compass sign-in** is handled by Supabase Auth.
2. **Google and Microsoft data connections** are handled by Compass server routes after the user is signed in.

Signing in with Google or Microsoft does not automatically authorize Compass to read Gmail, Outlook, calendars, or contacts.

## 1. Compass sign-in through Supabase Auth

Email magic-link sign-in is the simplest first test and does not require a social provider.

In Supabase Dashboard → Authentication → URL Configuration:

- Set **Site URL** to the M26 test deployment, for example `https://compass-os-m26.onrender.com`.
- Add `http://localhost:3000/auth/callback` for local development.
- Add `https://YOUR-M26-HOST/auth/callback` for the deployed app.

To enable **Continue with Google** or **Continue with Microsoft** on the Compass sign-in page, configure those providers inside Supabase Auth. The OAuth app used for Supabase social sign-in must use Supabase's provider callback URL:

`https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

This is different from the provider-data callback routes below.

## 2. Google data connection

Create a separate Google Cloud OAuth 2.0 **Web application** for Compass data access.

Enable:

- Gmail API
- Google Calendar API
- People API

Authorized JavaScript origins:

- `http://localhost:3000`
- `https://YOUR-M26-HOST`

Authorized redirect URIs:

- `http://localhost:3000/api/oauth/google/callback`
- `https://YOUR-M26-HOST/api/oauth/google/callback`

Set these server-only variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Compass requests:

- `openid`
- `email`
- `profile`
- Gmail read-only
- Calendar read-only
- Contacts read-only

The flow uses signed state, an HttpOnly state cookie, and S256 PKCE. The callback must exactly match the host in `NEXT_PUBLIC_APP_URL`.

Gmail read-only is a restricted Google scope. Keep the OAuth app in testing with explicitly listed test users until the consent screen and verification requirements are complete. Production storage or transmission of restricted Gmail data may require an independent security assessment.

## 3. Microsoft data connection

Create a separate Microsoft Entra application registration for Compass data access.

Use the **Web** platform and add these redirect URIs:

- `http://localhost:3000/api/oauth/microsoft/callback`
- `https://YOUR-M26-HOST/api/oauth/microsoft/callback`

Add delegated permissions:

- `User.Read`
- `Mail.Read`
- `Calendars.Read`
- `Contacts.Read`
- `offline_access`
- `openid`
- `profile`
- `email`

Create a client secret and set:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT=common` to allow personal and organizational Microsoft accounts

The authorization-code flow uses signed state, a provider-specific HttpOnly cookie, S256 PKCE, and the confidential web-app client secret.

## Exact callback summary

| Purpose | Callback |
| --- | --- |
| Supabase Google/Microsoft sign-in provider | `https://PROJECT-REF.supabase.co/auth/v1/callback` |
| Compass app sign-in completion | `https://YOUR-M26-HOST/auth/callback` |
| Google Gmail/Calendar/Contacts connection | `https://YOUR-M26-HOST/api/oauth/google/callback` |
| Microsoft Mail/Calendar/Contacts connection | `https://YOUR-M26-HOST/api/oauth/microsoft/callback` |

Never put OAuth client secrets, the Supabase service-role key, or token-encryption secrets in `NEXT_PUBLIC_*` variables.
