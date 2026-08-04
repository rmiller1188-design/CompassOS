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

function microsoftTokenSet(json: Record<string, unknown>, retainedRefreshToken: string | null = null): ProviderTokenSet {
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("MICROSOFT_TOKEN_RESPONSE_INVALID");
  }
  const expiresIn = Number(json.expires_in);
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" && json.refresh_token ? json.refresh_token : retainedRefreshToken,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    tokenType: typeof json.token_type === "string" ? json.token_type : null,
    scope: typeof json.scope === "string" ? json.scope : null,
    idToken: typeof json.id_token === "string" ? json.id_token : null
  };
}

export function microsoftAuthorizationUrl(state: string, codeChallenge: string): string {
  const url = new URL(authorizeEndpoint());
  url.searchParams.set("client_id", env.microsoftClientId());
  url.searchParams.set("redirect_uri", `${env.appUrl()}/api/oauth/microsoft/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_READ_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeMicrosoftCode(code: string, codeVerifier: string): Promise<ProviderTokenSet> {
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: env.microsoftClientId(),
      client_secret: env.microsoftClientSecret(),
      redirect_uri: `${env.appUrl()}/api/oauth/microsoft/callback`,
      grant_type: "authorization_code",
      scope: MICROSOFT_READ_SCOPES.join(" ")
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_TOKEN_EXCHANGE_${response.status}`);
  return microsoftTokenSet(await response.json() as Record<string, unknown>);
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
  return microsoftTokenSet(await response.json() as Record<string, unknown>, refreshToken);
}

export async function microsoftIdentity(accessToken: string): Promise<ProviderIdentity> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_IDENTITY_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  const email = typeof json.mail === "string" && json.mail
    ? json.mail
    : typeof json.userPrincipalName === "string" && json.userPrincipalName
      ? json.userPrincipalName
      : null;
  if (typeof json.id !== "string" || !json.id || !email) {
    throw new Error("MICROSOFT_IDENTITY_RESPONSE_INVALID");
  }
  return {
    externalAccountId: json.id,
    email,
    displayName: typeof json.displayName === "string" && json.displayName ? json.displayName : null
  };
}
