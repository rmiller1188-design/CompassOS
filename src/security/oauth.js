import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PROVIDER_SCOPES = Object.freeze({
  google: Object.freeze({
    identity: ["openid", "email", "profile"],
    mailRead: ["https://www.googleapis.com/auth/gmail.readonly"],
    calendarRead: ["https://www.googleapis.com/auth/calendar.readonly"],
    contactsRead: ["https://www.googleapis.com/auth/contacts.readonly"],
  }),
  microsoft: Object.freeze({
    identity: ["openid", "profile", "email", "offline_access"],
    mailRead: ["Mail.Read"],
    calendarRead: ["Calendars.Read"],
    contactsRead: ["Contacts.Read"],
  }),
});

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

export function createPkcePair() {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" };
}

export function createOAuthState({ userId, provider, redirectTo, ttlSeconds = 600, now = Date.now() }) {
  if (!userId || !["google", "microsoft"].includes(provider)) {
    throw new TypeError("A userId and supported provider are required");
  }
  const nonce = base64url(randomBytes(24));
  return {
    nonceHash: createHash("sha256").update(nonce).digest("hex"),
    nonce,
    userId,
    provider,
    redirectTo: redirectTo || "/",
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
  };
}

export function verifyOAuthState({ nonce, storedNonceHash, expiresAt, now = Date.now() }) {
  if (!nonce || !storedNonceHash || !expiresAt) return false;
  if (new Date(expiresAt).getTime() <= now) return false;
  const actual = createHash("sha256").update(nonce).digest();
  const expected = Buffer.from(storedNonceHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function buildReadOnlyScopes(provider, features = {}) {
  const manifest = PROVIDER_SCOPES[provider];
  if (!manifest) throw new TypeError(`Unsupported provider: ${provider}`);
  const scopes = [...manifest.identity];
  if (features.mail !== false) scopes.push(...manifest.mailRead);
  if (features.calendar) scopes.push(...manifest.calendarRead);
  if (features.contacts) scopes.push(...manifest.contactsRead);
  return [...new Set(scopes)];
}
