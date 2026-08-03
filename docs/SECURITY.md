# M26 Security Notes

## Credential vault

`provider_connections` contains only user-readable connection metadata. OAuth token material is encrypted into `provider_credentials` using AES-256-GCM.

The encryption key is provided through `TOKEN_ENCRYPTION_KEY` and must be a base64-encoded 32-byte secret. It must never be exposed through `NEXT_PUBLIC_*` variables.

`provider_credentials` has RLS enabled, privileges revoked from `anon` and `authenticated`, and is accessed only through the Supabase service-role client on the server.

## OAuth state

OAuth state contains the provider, user ID, profile ID, a random nonce, and issued timestamp. It is HMAC-signed and also stored in an HTTP-only SameSite cookie. Callbacks require both values to match and expire after ten minutes.

## Privacy boundaries

- Each authenticated user receives a private personal workspace.
- Provider sync writes only into that private workspace.
- Shared `Us` workspaces have separate membership records.
- No automatic database trigger copies private communications or events into shared workspaces.
- Partner invitations are email-bound and expire after seven days.

## Files

The `compass-files` bucket is private. Object paths begin with:

`workspace_id/user_id/randomized-file-name`

Storage RLS requires workspace membership and requires the second path segment to equal the uploading user.

## AI

The daily brief endpoint sends only the recent normalized records from the selected workspace. OpenAI requests use the server-side API key and set `store: false`. The API key is never sent to the browser.

## External actions

The `action_requests` table is the required boundary for future email sending, event changes, and financial actions. Those capabilities should not execute directly from a draft. They must create a pending request, receive explicit approval, then execute with an idempotency key and audit status.
