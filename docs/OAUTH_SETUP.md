# OAuth Setup

M26 uses two different OAuth layers:

1. **Compass sign-in** through Supabase Auth.
2. **Provider data connections** through Compass server routes so Gmail/Outlook access can be requested independently and stored in the encrypted vault.

## Google data connection

Create a Google Cloud OAuth Web Application.

Authorized JavaScript origins:

- `http://localhost:3000`
- your M26 Render URL

Authorized redirect URIs:

- `http://localhost:3000/api/oauth/google/callback`
- `https://YOUR-M26-RENDER-URL.onrender.com/api/oauth/google/callback`

Set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Requested M26 scopes:

- `openid`
- `email`
- `profile`
- Gmail read-only
- Calendar read-only
- Contacts read-only

Because Gmail read access is sensitive/restricted, production use may require Google OAuth verification and potentially additional security review. Keep testing users limited until verification is complete.

## Microsoft data connection

Create a Microsoft Entra application registration.

Redirect URIs:

- `http://localhost:3000/api/oauth/microsoft/callback`
- `https://YOUR-M26-RENDER-URL.onrender.com/api/oauth/microsoft/callback`

Delegated permissions:

- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`
- `Mail.Read`
- `Calendars.Read`
- `Contacts.Read`

Set:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT=common` for personal and organizational Microsoft accounts

## Supabase sign-in providers

Magic link works without social provider setup. To enable the Google and Microsoft buttons on `/sign-in`, also configure Google and Azure providers inside Supabase Auth and add:

- `http://localhost:3000/auth/callback`
- `https://YOUR-M26-RENDER-URL.onrender.com/auth/callback`

Supabase provider tokens are not used for Gmail/Outlook synchronization. Data connections are completed separately inside Settings.
