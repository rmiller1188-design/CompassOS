import { createAdminClient } from "@/lib/supabase/admin";
import { readProviderTokens, writeProviderTokens } from "@/lib/providers/vault";
import { refreshGoogleToken } from "@/lib/providers/google";
import { refreshMicrosoftToken } from "@/lib/providers/microsoft";
import type { ProviderName } from "@/lib/providers/types";

export async function providerAccessToken(connectionId: string, provider: ProviderName): Promise<string> {
  let tokens = await readProviderTokens(connectionId);
  const expiresSoon = !tokens.expiresAt || Date.parse(tokens.expiresAt) < Date.now() + 90_000;
  if (expiresSoon) {
    if (!tokens.refreshToken) throw new Error("PROVIDER_REAUTH_REQUIRED");
    tokens = provider === "google"
      ? await refreshGoogleToken(tokens.refreshToken)
      : await refreshMicrosoftToken(tokens.refreshToken);
    await writeProviderTokens(connectionId, tokens);
    const admin = createAdminClient();
    await admin.from("provider_connections").update({
      status: "healthy",
      token_expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString()
    }).eq("id", connectionId);
  }
  return tokens.accessToken;
}
