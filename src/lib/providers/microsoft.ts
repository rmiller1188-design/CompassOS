import { env } from "@/lib/env";
import type { ProviderIdentity, ProviderTokenSet } from "@/lib/providers/types";

export const MICROSOFT_READ_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
  "Contacts.Read"
];

const tenant = () => env.microsoftTenant();
const authorizeEndpoint = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
const tokenEndpoint = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;

export function microsoftAuthorizationUrl(state: string): string {
  const url = new URL(authorizeEndpoint());
  url.searchParams.set("client_id", env.microsoftClientId());
  url.searchParams.set("redirect_uri", `${env.appUrl()}/api/oauth/microsoft/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_READ_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeMicrosoftCode(code: string): Promise<ProviderTokenSet> {
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.microsoftClientId(),
      client_secret: env.microsoftClientSecret(),
      redirect_uri: `${env.appUrl()}/api/oauth/microsoft/callback`,
      grant_type: "authorization_code",
      scope: MICROSOFT_READ_SCOPES.join(" ")
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_TOKEN_EXCHANGE_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresAt: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null,
    tokenType: json.token_type ? String(json.token_type) : null,
    scope: json.scope ? String(json.scope) : null,
    idToken: json.id_token ? String(json.id_token) : null
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<ProviderTokenSet> {
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.microsoftClientId(),
      client_secret: env.microsoftClientSecret(),
      grant_type: "refresh_token",
      scope: MICROSOFT_READ_SCOPES.join(" ")
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_TOKEN_REFRESH_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null,
    tokenType: json.token_type ? String(json.token_type) : null,
    scope: json.scope ? String(json.scope) : null,
    idToken: json.id_token ? String(json.id_token) : null
  };
}

export async function microsoftIdentity(accessToken: string): Promise<ProviderIdentity> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_IDENTITY_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  return {
    externalAccountId: String(json.id),
    email: String(json.mail || json.userPrincipalName),
    displayName: json.displayName ? String(json.displayName) : null
  };
}
