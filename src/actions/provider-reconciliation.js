import { createHash } from "node:crypto";

export const MICROSOFT_COMPASS_PROPERTY_ID = "String {8ECCC264-6880-4EBE-992F-8888D8C01F5A} Name CompassIdempotencyHash";

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function providerError(response, payload) {
  const error = new Error(payload?.error?.message || payload?.error_description || `Provider request failed with ${response.status}`);
  error.status = response.status;
  error.code = payload?.error?.code || payload?.error || null;
  error.retryAfterMs = Number(response.headers?.get?.("retry-after") || 0) * 1000 || null;
  return error;
}

export function buildProviderCorrelation(idempotencyKey) {
  const digest = createHash("sha256").update(requireString(idempotencyKey, "Idempotency key"), "utf8").digest("hex");
  return Object.freeze({
    digest,
    gmailMessageId: `<compass-${digest}@compass.invalid>`,
    microsoftPropertyId: MICROSOFT_COMPASS_PROPERTY_ID,
    microsoftPropertyValue: digest,
  });
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

export function createGmailReconciliationLookup({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Gmail fetch and token resolver are required");
  return async function lookup({ account, reconciliation }) {
    if (account?.provider !== "google") throw new Error("Google account is required for Gmail reconciliation");
    const hash = requireString(reconciliation?.idempotencyKeyHash, "Idempotency key hash");
    const token = await tokenResolver(account);
    const marker = `<compass-${hash}@compass.invalid>`;
    const params = new URLSearchParams({ q: `in:sent rfc822msgid:${marker}`, maxResults: "2" });
    const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await parseJson(response);
    if (!response.ok) throw providerError(response, result);
    const messages = Array.isArray(result.messages) ? result.messages : [];
    if (messages.length === 0) return { status: "not_found", evidence: { provider: "google", matchCount: 0 } };
    if (messages.length !== 1 || !messages[0]?.id) return { status: "unknown", evidence: { provider: "google", matchCount: messages.length, reason: "NON_UNIQUE_CORRELATION" } };
    return {
      status: "succeeded",
      receipt: { provider: "google", providerMessageId: messages[0].id, providerThreadId: messages[0].threadId || null },
      evidence: { provider: "google", matchCount: 1, correlation: "rfc822-message-id" },
    };
  };
}

export function createMicrosoftReconciliationLookup({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Microsoft fetch and token resolver are required");
  return async function lookup({ account, reconciliation }) {
    if (account?.provider !== "microsoft") throw new Error("Microsoft account is required for Graph reconciliation");
    const hash = requireString(reconciliation?.idempotencyKeyHash, "Idempotency key hash");
    const token = await tokenResolver(account);
    const escapedProperty = MICROSOFT_COMPASS_PROPERTY_ID.replaceAll("'", "''");
    const escapedHash = hash.replaceAll("'", "''");
    const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${escapedProperty}' and ep/value eq '${escapedHash}')`;
    const params = new URLSearchParams({
      "$filter": filter,
      "$select": "id,conversationId,internetMessageId,sentDateTime",
      "$expand": `singleValueExtendedProperties($filter=id eq '${escapedProperty}')`,
      "$top": "2",
    });
    const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${params.toString()}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' },
    });
    const result = await parseJson(response);
    if (!response.ok) throw providerError(response, result);
    const messages = Array.isArray(result.value) ? result.value : [];
    if (messages.length === 0) return { status: "not_found", evidence: { provider: "microsoft", matchCount: 0 } };
    if (messages.length !== 1 || !messages[0]?.id) return { status: "unknown", evidence: { provider: "microsoft", matchCount: messages.length, reason: "NON_UNIQUE_CORRELATION" } };
    const message = messages[0];
    return {
      status: "succeeded",
      receipt: { provider: "microsoft", providerMessageId: message.id, providerThreadId: message.conversationId || null, providerInternetMessageId: message.internetMessageId || null },
      evidence: { provider: "microsoft", matchCount: 1, correlation: "single-value-extended-property" },
    };
  };
}

export function createProviderReconciliationLookup({ google, microsoft } = {}) {
  return async function lookup({ account, reconciliation }) {
    if (!account?.provider) throw new TypeError("Connected account provider is required");
    const providerLookup = account.provider === "google" ? google : account.provider === "microsoft" ? microsoft : null;
    if (typeof providerLookup !== "function") return { status: "unknown", evidence: { provider: account.provider, reason: "LOOKUP_UNAVAILABLE" } };
    return providerLookup({ account, reconciliation });
  };
}
