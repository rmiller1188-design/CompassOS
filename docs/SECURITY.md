# M26 Security Notes

## Credential vault

`provider_connections` contains only connection metadata. OAuth access and refresh tokens are encrypted into `provider_credentials` with AES-256-GCM.

`TOKEN_ENCRYPTION_KEY` must be a Base64-encoded 32-byte secret. It must never be exposed through a `NEXT_PUBLIC_*` variable.

`provider_credentials` has row-level security enabled, privileges revoked from browser roles, and is accessed only through the server-side Supabase service-role client.

## OAuth integrity

Provider-data authorization uses all of the following:

- HMAC-signed state containing provider, user, profile, nonce, and issued timestamp
- provider-specific HttpOnly SameSite cookies
- ten-minute state expiration
- S256 PKCE with a one-time verifier stored only in an HttpOnly cookie
- exact callback paths
- connection status remains `reauth_required` until encrypted credentials are safely written
- malformed provider token and identity responses are rejected

Compass login through Supabase Auth is separate from Google and Microsoft data authorization.

## Privacy boundaries

- Each authenticated user receives a private personal workspace.
- Provider sync writes only into that user's private workspace.
- Shared `Us` workspaces have separate membership records.
- No automatic trigger copies private communications or events into a shared workspace.
- A user cannot self-insert into an arbitrary workspace.
- Partner invitations are email-bound, expire after seven days, and are consumed atomically.
- Shared-workspace creation is transactional and protected against duplicate concurrent requests.

## Files

The `compass-files` bucket is private. New object paths use:

`workspace_id/private|shared/owner_id/randomized-file-name`

Storage policies enforce the visibility segment:

- `private` objects are readable only by the owner encoded in the path.
- `shared` objects are readable only by current members of that workspace.
- Only the path owner can upload, update, or delete the object.

File metadata uses the same private-versus-shared rules. Server endpoints verify that upload completion matches the signed path, workspace, user, and visibility requested originally.

## Provider disconnect

Disconnecting removes encrypted provider credentials and stops future synchronization. Imported messages, events, and contacts remain in Compass until the user explicitly deletes them. Reconnecting the same external account reuses the connection record.

## AI

The daily brief endpoint sends only recent normalized records from the selected workspace. OpenAI requests use the server-side API key and set `store: false`. The API key is never sent to the browser.

## External actions

The `action_requests` table is the required boundary for future email sending, event changes, and financial actions. Browser roles cannot directly update approval records in M26.

Future action execution must:

1. Create a pending request.
2. Display the exact external effect to an authorized approver.
3. Record approval separately from proposal generation.
4. Execute server-side with an idempotency key.
5. Retain audit status and sanitized provider errors.

No production email sending, event writing, or money movement is enabled in this branch.
