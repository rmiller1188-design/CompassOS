import { createHash } from "node:crypto";

export const MICROSOFT_COMPASS_PROPERTY_ID = "String {8ECCC264-6880-4EBE-992F-8888D8C01F5A} Name CompassIdempotencyHash";
export const MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID = "String {8ECCC264-6880-4EBE-992F-8888D8C01F5A} Name CompassCalendarIdempotencyHash";
export const GOOGLE_CALENDAR_COMPASS_PROPERTY = "compassIdempotencyHash";

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
    googleCalendarPrivateProperty: GOOGLE_CALENDAR_COMPASS_PROPERTY,
    microsoftCalendarPropertyId: MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID,
  });
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function calendarContext(action, reconciliation) {
  const actionType = requireString(action?.actionType || reconciliation?.actionType, "Calendar action type");
  if (!actionType.startsWith("calendar.")) throw new Error("Calendar reconciliation requires a calendar action");
  const payload = action?.payload;
  if (!payload || payload.actionType !== actionType) throw new Error("Calendar reconciliation requires the exact outbound payload");
  return { actionType, payload, hash: requireString(reconciliation?.idempotencyKeyHash, "Idempotency key hash") };
}

function graphPropertyFilter(propertyId, hash) {
  const escapedProperty = propertyId.replaceAll("'", "''");
  const escapedHash = hash.replaceAll("'", "''");
  return `singleValueExtendedProperties/Any(ep: ep/id eq '${escapedProperty}' and ep/value eq '${escapedHash}')`;
}

function hasMicrosoftProperty(event, hash) {
  const properties = Array.isArray(event?.singleValueExtendedProperties) ? event.singleValueExtendedProperties : [];
  return properties.some((property) => property?.id === MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID && property?.value === hash);
}

function googleCalendarReceipt(event) {
  return { provider: "google", providerEventId: event.id, htmlLink: event.htmlLink || null, status: event.status || null };
}

function microsoftCalendarReceipt(event, responseStatus = null) {
  return { provider: "microsoft", providerEventId: event.id, webLink: event.webLink || null, responseStatus };
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
    const filter = graphPropertyFilter(MICROSOFT_COMPASS_PROPERTY_ID, hash);
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

export function createGoogleCalendarReconciliationLookup({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Google Calendar fetch and token resolver are required");
  return async function lookup({ account, reconciliation, action }) {
    if (account?.provider !== "google") throw new Error("Google account is required for Calendar reconciliation");
    const { actionType, payload, hash } = calendarContext(action, reconciliation);
    const token = await tokenResolver(account);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(payload.calendarId || "primary")}/events`;

    if (actionType === "calendar.create") {
      const params = new URLSearchParams({ privateExtendedProperty: `${GOOGLE_CALENDAR_COMPASS_PROPERTY}=${hash}`, maxResults: "2", singleEvents: "true" });
      const response = await fetchImpl(`${base}?${params.toString()}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
      const result = await parseJson(response);
      if (!response.ok) throw providerError(response, result);
      const events = Array.isArray(result.items) ? result.items : [];
      if (events.length === 0) return { status: "not_found", evidence: { provider: "google", matchCount: 0, correlation: "calendar-private-extended-property" } };
      if (events.length !== 1 || !events[0]?.id) return { status: "unknown", evidence: { provider: "google", matchCount: events.length, reason: "NON_UNIQUE_CORRELATION" } };
      return { status: "succeeded", receipt: googleCalendarReceipt(events[0]), evidence: { provider: "google", matchCount: 1, correlation: "calendar-private-extended-property" } };
    }

    const response = await fetchImpl(`${base}/${encodeURIComponent(payload.providerEventId)}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    const result = await parseJson(response);
    if (response.status === 404) return { status: "unknown", evidence: { provider: "google", reason: "RESOURCE_MISSING_NOT_PROOF_OF_ABSENCE" } };
    if (!response.ok) throw providerError(response, result);
    const marker = result?.extendedProperties?.private?.[GOOGLE_CALENDAR_COMPASS_PROPERTY];
    if (marker !== hash) return { status: "unknown", evidence: { provider: "google", reason: "CORRELATION_NOT_PRESENT" } };
    return { status: "succeeded", receipt: googleCalendarReceipt(result), evidence: { provider: "google", matchCount: 1, correlation: "calendar-private-extended-property" } };
  };
}

export function createMicrosoftCalendarReconciliationLookup({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Microsoft Calendar fetch and token resolver are required");
  return async function lookup({ account, reconciliation, action }) {
    if (account?.provider !== "microsoft") throw new Error("Microsoft account is required for Calendar reconciliation");
    const { actionType, payload, hash } = calendarContext(action, reconciliation);
    const token = await tokenResolver(account);
    const escapedProperty = MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID.replaceAll("'", "''");

    if (actionType === "calendar.create") {
      const params = new URLSearchParams({
        "$filter": graphPropertyFilter(MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID, hash),
        "$select": "id,webLink,lastModifiedDateTime",
        "$expand": `singleValueExtendedProperties($filter=id eq '${escapedProperty}')`,
        "$top": "2",
      });
      const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/events?${params.toString()}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
      const result = await parseJson(response);
      if (!response.ok) throw providerError(response, result);
      const events = Array.isArray(result.value) ? result.value : [];
      if (events.length === 0) return { status: "not_found", evidence: { provider: "microsoft", matchCount: 0, correlation: "calendar-single-value-extended-property" } };
      if (events.length !== 1 || !events[0]?.id) return { status: "unknown", evidence: { provider: "microsoft", matchCount: events.length, reason: "NON_UNIQUE_CORRELATION" } };
      return { status: "succeeded", receipt: microsoftCalendarReceipt(events[0]), evidence: { provider: "microsoft", matchCount: 1, correlation: "calendar-single-value-extended-property" } };
    }

    const expand = encodeURIComponent(`singleValueExtendedProperties($filter=id eq '${escapedProperty}')`);
    const select = encodeURIComponent("id,webLink,responseStatus,lastModifiedDateTime");
    const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(payload.providerEventId)}?$select=${select}&$expand=${expand}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    const result = await parseJson(response);
    if (response.status === 404) return { status: "unknown", evidence: { provider: "microsoft", reason: "RESOURCE_MISSING_NOT_PROOF_OF_ABSENCE" } };
    if (!response.ok) throw providerError(response, result);

    if (actionType === "calendar.respond") {
      const desired = payload.responseStatus === "tentative" ? "tentativelyAccepted" : payload.responseStatus;
      const actual = result?.responseStatus?.response || null;
      if (actual !== desired) return { status: "unknown", evidence: { provider: "microsoft", reason: "RESPONSE_STATE_MISMATCH", desired, actual } };
      return { status: "succeeded", receipt: microsoftCalendarReceipt(result, payload.responseStatus), evidence: { provider: "microsoft", matchCount: 1, correlation: "calendar-response-desired-state" } };
    }

    if (!hasMicrosoftProperty(result, hash)) return { status: "unknown", evidence: { provider: "microsoft", reason: "CORRELATION_NOT_PRESENT" } };
    return { status: "succeeded", receipt: microsoftCalendarReceipt(result), evidence: { provider: "microsoft", matchCount: 1, correlation: "calendar-single-value-extended-property" } };
  };
}

export function createProviderReconciliationLookup({ google, microsoft, calendarGoogle, calendarMicrosoft } = {}) {
  return async function lookup({ account, reconciliation, action = null }) {
    if (!account?.provider) throw new TypeError("Connected account provider is required");
    const actionType = String(action?.actionType || reconciliation?.actionType || "");
    const isCalendar = actionType.startsWith("calendar.");
    const providerLookup = account.provider === "google"
      ? (isCalendar ? calendarGoogle : google)
      : account.provider === "microsoft"
        ? (isCalendar ? calendarMicrosoft : microsoft)
        : null;
    if (typeof providerLookup !== "function") return { status: "unknown", evidence: { provider: account.provider, reason: "LOOKUP_UNAVAILABLE" } };
    return providerLookup({ account, reconciliation, action });
  };
}
