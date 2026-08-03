import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson, encryptJson, type EncryptedPayload } from "@/lib/crypto";
import type { ProviderTokenSet } from "@/lib/providers/types";

export async function writeProviderTokens(connectionId: string, tokens: ProviderTokenSet) {
  const admin = createAdminClient();
  const encrypted = encryptJson(tokens);
  const { error } = await admin.from("provider_credentials").upsert({
    connection_id: connectionId,
    encrypted_payload: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    key_version: encrypted.version,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function readProviderTokens(connectionId: string): Promise<ProviderTokenSet> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("provider_credentials")
    .select("encrypted_payload, iv, auth_tag, key_version")
    .eq("connection_id", connectionId)
    .single();
  if (error || !data) throw new Error("PROVIDER_CREDENTIALS_NOT_FOUND");
  const payload: EncryptedPayload = {
    ciphertext: data.encrypted_payload,
    iv: data.iv,
    authTag: data.auth_tag,
    version: data.key_version
  };
  return decryptJson<ProviderTokenSet>(payload);
}
