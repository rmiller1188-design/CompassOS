import crypto from "node:crypto";
import { env } from "@/lib/env";

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
  version: number;
};

function key(): Buffer {
  const raw = Buffer.from(env.tokenEncryptionKey(), "base64");
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  }
  return raw;
}

export function encryptJson(value: unknown): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    version: 1
  };
}

export function decryptJson<T>(payload: EncryptedPayload): T {
  if (payload.version !== 1) throw new Error("Unsupported encrypted payload version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
