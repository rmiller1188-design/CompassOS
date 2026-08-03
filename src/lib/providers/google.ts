import { env } from "@/lib/env";
import type { ProviderIdentity, ProviderTokenSet } from "@/lib/providers/types";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

export const GOOGLE_READ_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/contacts.readonly"
];

export function googleAuthorizationUrl(state: string): string {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", env.googleClientId());
  url.searchParams.set("redirect_uri", `${env.appUrl()}/api/oauth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_READ_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<ProviderTokenSet> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      redirect_uri: `${env.appUrl()}/api/oauth/google/callback`,
      grant_type: "authorization_code"
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_EXCHANGE_${response.status}`);
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

export async function refreshGoogleToken(refreshToken: string): Promise<ProviderTokenSet> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_REFRESH_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  return {
    accessToken: String(json.access_token),
    refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null,
    tokenType: json.token_type ? String(json.token_type) : null,
    scope: json.scope ? String(json.scope) : null
  };
}

export async function googleIdentity(accessToken: string): Promise<ProviderIdentity> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GOOGLE_IDENTITY_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  return {
    externalAccountId: String(json.sub),
    email: String(json.email),
    displayName: json.name ? String(json.name) : null
  };
}
