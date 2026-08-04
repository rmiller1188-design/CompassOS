import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

function requireKey(key) {
  const value = Buffer.isBuffer(key) ? key : Buffer.from(key || "", "base64");
  if (value.length !== 32) throw new TypeError("Token encryption key must be exactly 32 bytes");
  return value;
}

export function encryptTokenPayload(payload, key, context = {}) {
  if (!payload || typeof payload !== "object") throw new TypeError("Token payload must be an object");
  const encryptionKey = requireKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const aad = Buffer.from(JSON.stringify({ version: VERSION, ...context }));
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    context,
  };
}

export function decryptTokenPayload(envelope, key) {
  if (!envelope || envelope.version !== VERSION || envelope.algorithm !== ALGORITHM) {
    throw new TypeError("Unsupported token envelope");
  }
  const encryptionKey = requireKey(key);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(JSON.stringify({ version: VERSION, ...(envelope.context || {}) })));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

export function redactTokenPayload(payload) {
  return {
    access_token: payload?.access_token ? "[REDACTED]" : undefined,
    refresh_token: payload?.refresh_token ? "[REDACTED]" : undefined,
    token_type: payload?.token_type,
    scope: payload?.scope,
    expires_at: payload?.expires_at,
  };
}
