import { createHash } from "node:crypto";

const CALENDAR_WRITE_SCOPES = Object.freeze({
  google: new Set(["https://www.googleapis.com/auth/calendar.events"]),
  microsoft: new Set(["Calendars.ReadWrite"]),
});

const ACTION_TYPES = new Set(["calendar.create", "calendar.update", "calendar.respond"]);
const RESPONSE_STATUSES = new Set(["accepted", "tentative", "declined"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError(`Invalid email address: ${value}`);
  return email;
}

function normalizeAttendees(values = []) {
  const byEmail = new Map();
  for (const value of values) {
    const attendee = typeof value === "string" ? { email: value } : value;
    const email = normalizeEmail(attendee.email);
    byEmail.set(email, { email, optional: Boolean(attendee.optional), displayName: attendee.displayName ? String(attendee.displayName).trim() : null });
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

function iso(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString();
}

function providerError(response, payload) {
  const error = new Error(payload?.error?.message || payload?.error_description || `Provider request failed with ${response.status}`);
  error.status = response.status;
  error.code = payload?.error?.code || payload?.error || null;
  error.retryAfterMs = Number(response.headers?.get?.("retry-after") || 0) * 1000 || null;
  return error;
}

export function hashCalendarPayload(payload) {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

export function createCalendarApprovalPayload(input) {
  const actionType = String(input?.actionType || "");
  if (!ACTION_TYPES.has(actionType)) throw new TypeError("Supported calendar action type is required");
  if (!input.accountId) throw new TypeError("Calendar account is required");

  const payload = {
    version: 1,
    actionType,
    accountId: String(input.accountId),
    providerEventId: input.providerEventId ? String(input.providerEventId) : null,
    calendarId: input.calendarId ? String(input.calendarId) : "primary",
    title: input.title == null ? null : String(input.title).trim(),
    description: input.description == null ? null : String(input.description),
    location: input.location == null ? null : String(input.location).trim(),
    startsAt: input.startsAt ? iso(input.startsAt, "startsAt") : null,
    endsAt: input.endsAt ? iso(input.endsAt, "endsAt") : null,
    timezone: input.timezone ? String(input.timezone) : "UTC",
    attendees: normalizeAttendees(input.attendees || []),
    responseStatus: input.responseStatus ? String(input.responseStatus) : null,
    responseComment: input.responseComment ? String(input.responseComment).trim() : null,
    sourceEventId: input.sourceEventId ? String(input.sourceEventId) : null,
  };

  if (actionType === "calendar.create") {
    if (payload.providerEventId) throw new TypeError("Create action cannot include a provider event id");
    if (!payload.title || !payload.startsAt || !payload.endsAt) throw new TypeError("Create action requires title, start, and end");
  } else if (!payload.providerEventId) {
    throw new TypeError("Update and response actions require a provider event id");
  }

  if (["calendar.create", "calendar.update"].includes(actionType)) {
    if (!payload.startsAt || !payload.endsAt || new Date(payload.startsAt) >= new Date(payload.endsAt)) throw new TypeError("Calendar event end must be after start");
  }

  if (actionType === "calendar.respond" && !RESPONSE_STATUSES.has(payload.responseStatus)) {
    throw new TypeError("Calendar response must be accepted, tentative, or declined");
  }

  return { payload, payloadHash: hashCalendarPayload(payload) };
}

export function diffCalendarPayload(previous, next) {
  const fields = ["title", "description", "location", "startsAt", "endsAt", "timezone", "attendees", "responseStatus", "responseComment"];
  return fields.flatMap((field) => JSON.stringify(stable(previous?.[field] ?? null)) === JSON.stringify(stable(next?.[field] ?? null))
    ? []
    : [{ field, before: previous?.[field] ?? null, after: next?.[field] ?? null }]);
}

export function assertCalendarWriteConsent(account) {
  const required = CALENDAR_WRITE_SCOPES[account?.provider];
  if (!required) throw new TypeError("Supported connected account is required");
  if (account.status !== "active") throw new Error("Connected account is not active");
  const granted = new Set(account.grantedScopes || []);
  for (const scope of required) if (!granted.has(scope)) throw new Error(`Separate ${account.provider} calendar-write consent is required`);
  return true;
}

export function assertApprovedCalendarPayloadUnchanged({ approvedPayloadHash, payload }) {
  if (!approvedPayloadHash || hashCalendarPayload(payload) !== approvedPayloadHash) throw new Error("Calendar payload changed after approval; a new approval is required");
  return true;
}

function googleEvent(payload) {
  return {
    summary: payload.title,
    description: payload.description,
    location: payload.location,
    start: { dateTime: payload.startsAt, timeZone: payload.timezone },
    end: { dateTime: payload.endsAt, timeZone: payload.timezone },
    attendees: payload.attendees.map((a) => ({ email: a.email, displayName: a.displayName || undefined, optional: a.optional })),
  };
}

export function createGoogleCalendarActionAdapter({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Google fetch and token resolver are required");
  return {
    provider: "google",
    async execute({ account, payload, idempotencyKey }) {
      const token = await tokenResolver(account);
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(payload.calendarId)}/events`;
      let url = base;
      let method = "POST";
      let body;
      if (payload.actionType === "calendar.create") body = googleEvent(payload);
      if (payload.actionType === "calendar.update") {
        url = `${base}/${encodeURIComponent(payload.providerEventId)}?sendUpdates=all`;
        method = "PATCH";
        body = googleEvent(payload);
      }
      if (payload.actionType === "calendar.respond") {
        url = `${base}/${encodeURIComponent(payload.providerEventId)}?sendUpdates=all`;
        method = "PATCH";
        body = { attendees: payload.attendees.map((a) => ({ email: a.email, responseStatus: a.email === account.email ? payload.responseStatus : undefined })) };
      }
      const response = await fetchImpl(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-compass-idempotency-key": idempotencyKey }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw providerError(response, result);
      return { provider: "google", providerEventId: result.id || payload.providerEventId, providerRequestId: response.headers?.get?.("x-request-id") || null, htmlLink: result.htmlLink || null, status: result.status || null };
    },
  };
}

function microsoftEvent(payload) {
  return {
    subject: payload.title,
    body: { contentType: "Text", content: payload.description || "" },
    location: payload.location ? { displayName: payload.location } : null,
    start: { dateTime: payload.startsAt, timeZone: payload.timezone },
    end: { dateTime: payload.endsAt, timeZone: payload.timezone },
    attendees: payload.attendees.map((a) => ({ emailAddress: { address: a.email, name: a.displayName || undefined }, type: a.optional ? "optional" : "required" })),
  };
}

export function createMicrosoftCalendarActionAdapter({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Microsoft fetch and token resolver are required");
  return {
    provider: "microsoft",
    async execute({ account, payload, idempotencyKey }) {
      const token = await tokenResolver(account);
      let url = "https://graph.microsoft.com/v1.0/me/events";
      let method = "POST";
      let body = microsoftEvent(payload);
      if (payload.actionType === "calendar.update") {
        url += `/${encodeURIComponent(payload.providerEventId)}`;
        method = "PATCH";
      }
      if (payload.actionType === "calendar.respond") {
        const verb = payload.responseStatus === "accepted" ? "accept" : payload.responseStatus === "tentative" ? "tentativelyAccept" : "decline";
        url += `/${encodeURIComponent(payload.providerEventId)}/${verb}`;
        body = { comment: payload.responseComment || "", sendResponse: true };
      }
      const response = await fetchImpl(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "client-request-id": idempotencyKey, "return-client-request-id": "true" }, body: JSON.stringify(body) });
      const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (!response.ok) throw providerError(response, result);
      return { provider: "microsoft", providerEventId: result.id || payload.providerEventId, providerRequestId: response.headers?.get?.("request-id") || null, webLink: result.webLink || null, responseStatus: payload.responseStatus || null };
    },
  };
}

export function createCalendarExecutionService({ actionStore, adapters, now = () => new Date() } = {}) {
  if (!actionStore || !adapters) throw new TypeError("Action store and provider adapters are required");
  return {
    async execute({ userId, actionId }) {
      const action = await actionStore.claimApprovedAction({ userId, actionId, now: now().toISOString() });
      if (!action) throw new Error("Approved action was not available for execution");
      try {
        if (action.userId !== userId) throw new Error("Outbound action ownership mismatch");
        if (action.status !== "executing" || !ACTION_TYPES.has(action.actionType)) throw new Error("Outbound calendar action is not executable");
        assertCalendarWriteConsent(action.account);
        assertApprovedCalendarPayloadUnchanged({ approvedPayloadHash: action.approvedPayloadHash, payload: action.payload });
        const adapter = adapters[action.account.provider];
        if (!adapter || adapter.provider !== action.account.provider) throw new Error("Provider calendar adapter is unavailable");
        const existing = await actionStore.getReceiptByIdempotencyKey(action.idempotencyKey);
        if (existing) return existing;
        const providerReceipt = await adapter.execute({ account: action.account, payload: action.payload, idempotencyKey: action.idempotencyKey });
        return await actionStore.completeAction({ userId, actionId, providerReceipt, completedAt: now().toISOString() });
      } catch (error) {
        await actionStore.failAction({ userId, actionId, error: { message: String(error.message || error), code: error.code || null, status: error.status || null, retryAfterMs: error.retryAfterMs || null }, failedAt: now().toISOString() });
        throw error;
      }
    },
  };
}

export { ACTION_TYPES, CALENDAR_WRITE_SCOPES, RESPONSE_STATUSES };
