import test from "node:test";
import assert from "node:assert/strict";
import {
  assertApprovedCalendarPayloadUnchanged,
  assertCalendarWriteConsent,
  createCalendarApprovalPayload,
  createCalendarExecutionService,
  createGoogleCalendarActionAdapter,
  createMicrosoftCalendarActionAdapter,
  diffCalendarPayload,
} from "../src/actions/calendar-execution.js";

const googleAccount = { id: "ga", provider: "google", email: "owner@example.com", status: "active", grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] };
const microsoftAccount = { id: "ma", provider: "microsoft", email: "owner@example.com", status: "active", grantedScopes: ["Calendars.ReadWrite"] };

function eventInput(overrides = {}) {
  return {
    actionType: "calendar.create",
    accountId: "ga",
    title: "Project review",
    startsAt: "2026-08-06T17:00:00Z",
    endsAt: "2026-08-06T18:00:00Z",
    timezone: "America/Los_Angeles",
    attendees: ["B@example.com", { email: "a@example.com", optional: true }],
    sourceEventId: "source-1",
    ...overrides,
  };
}

function response({ ok = true, status = 200, body = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => body,
  };
}

test("calendar payload is canonical, deterministic, and diffable", () => {
  const first = createCalendarApprovalPayload(eventInput());
  const second = createCalendarApprovalPayload(eventInput({ attendees: [{ email: "a@example.com", optional: true }, "b@example.com"] }));
  assert.equal(first.payloadHash, second.payloadHash);
  assert.deepEqual(first.payload.attendees.map((a) => a.email), ["a@example.com", "b@example.com"]);
  assertApprovedCalendarPayloadUnchanged({ approvedPayloadHash: first.payloadHash, payload: first.payload });
  const changed = { ...first.payload, location: "Room 210" };
  assert.deepEqual(diffCalendarPayload(first.payload, changed), [{ field: "location", before: null, after: "Room 210" }]);
  assert.throws(() => assertApprovedCalendarPayloadUnchanged({ approvedPayloadHash: first.payloadHash, payload: changed }), /new approval/);
});

test("calendar payload validation rejects unsafe or incomplete actions", () => {
  assert.throws(() => createCalendarApprovalPayload(eventInput({ endsAt: "2026-08-06T16:00:00Z" })), /end must be after start/);
  assert.throws(() => createCalendarApprovalPayload(eventInput({ attendees: ["not-email"] })), /Invalid email/);
  assert.throws(() => createCalendarApprovalPayload({ actionType: "calendar.update", accountId: "ga" }), /provider event id/);
  assert.throws(() => createCalendarApprovalPayload({ actionType: "calendar.respond", accountId: "ga", providerEventId: "e1", responseStatus: "maybe" }), /accepted, tentative, or declined/);
});

test("calendar write consent is separate from read consent", () => {
  assert.equal(assertCalendarWriteConsent(googleAccount), true);
  assert.equal(assertCalendarWriteConsent(microsoftAccount), true);
  assert.throws(() => assertCalendarWriteConsent({ ...googleAccount, grantedScopes: ["https://www.googleapis.com/auth/calendar.readonly"] }), /calendar-write consent/);
  assert.throws(() => assertCalendarWriteConsent({ ...microsoftAccount, status: "reauth_required" }), /not active/);
});

test("Google adapter creates and updates events without exposing tokens", async () => {
  const calls = [];
  const adapter = createGoogleCalendarActionAdapter({
    tokenResolver: async () => "secret-google-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ body: { id: "g-event", htmlLink: "https://calendar.google/event" }, headers: { "x-request-id": "g-request" } });
    },
  });
  const { payload } = createCalendarApprovalPayload(eventInput());
  const receipt = await adapter.execute({ account: googleAccount, payload, idempotencyKey: "idem-1" });
  assert.equal(calls[0].url, "https://www.googleapis.com/calendar/v3/calendars/primary/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer secret-google-token");
  assert.equal(calls[0].init.headers["x-compass-idempotency-key"], "idem-1");
  assert.equal(JSON.stringify(receipt).includes("secret-google-token"), false);
  assert.equal(receipt.providerEventId, "g-event");
});

test("Google response patches only an explicitly approved attendee response", async () => {
  let request;
  const adapter = createGoogleCalendarActionAdapter({
    tokenResolver: async () => "token",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return response({ body: { id: "event-1", status: "confirmed" } });
    },
  });
  const { payload } = createCalendarApprovalPayload({ actionType: "calendar.respond", accountId: "ga", providerEventId: "event-1", responseStatus: "accepted", attendees: ["owner@example.com", "other@example.com"] });
  await adapter.execute({ account: googleAccount, payload, idempotencyKey: "idem-response" });
  const body = JSON.parse(request.init.body);
  assert.match(request.url, /event-1\?sendUpdates=all$/);
  assert.deepEqual(body.attendees, [{ email: "other@example.com" }, { email: "owner@example.com", responseStatus: "accepted" }]);
});

test("Microsoft adapter uses native create and response endpoints", async () => {
  const calls = [];
  const adapter = createMicrosoftCalendarActionAdapter({
    tokenResolver: async () => "secret-ms-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: calls.length === 1 ? 201 : 204, body: calls.length === 1 ? { id: "m-event", webLink: "https://outlook/event" } : {}, headers: { "request-id": "m-request" } });
    },
  });
  const created = createCalendarApprovalPayload(eventInput({ accountId: "ma" })).payload;
  const createReceipt = await adapter.execute({ account: microsoftAccount, payload: created, idempotencyKey: "idem-ms-create" });
  assert.equal(calls[0].url, "https://graph.microsoft.com/v1.0/me/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(createReceipt.providerEventId, "m-event");

  const responsePayload = createCalendarApprovalPayload({ actionType: "calendar.respond", accountId: "ma", providerEventId: "m-event", responseStatus: "tentative", responseComment: "I may be late" }).payload;
  await adapter.execute({ account: microsoftAccount, payload: responsePayload, idempotencyKey: "idem-ms-response" });
  assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/me/events/m-event/tentativelyAccept");
  assert.deepEqual(JSON.parse(calls[1].init.body), { comment: "I may be late", sendResponse: true });
});

test("execution service enforces ownership, approval hash, consent, and idempotency", async () => {
  const { payload, payloadHash } = createCalendarApprovalPayload(eventInput());
  const failures = [];
  let adapterCalls = 0;
  const receipt = { id: "receipt-existing" };
  const store = {
    claimApprovedAction: async () => ({ userId: "u1", status: "executing", actionType: "calendar.create", account: googleAccount, payload, approvedPayloadHash: payloadHash, idempotencyKey: "idem-existing" }),
    getReceiptByIdempotencyKey: async () => receipt,
    completeAction: async () => { throw new Error("must not complete twice"); },
    failAction: async (value) => failures.push(value),
  };
  const service = createCalendarExecutionService({ actionStore: store, adapters: { google: { provider: "google", execute: async () => { adapterCalls += 1; } } } });
  assert.equal(await service.execute({ userId: "u1", actionId: "a1" }), receipt);
  assert.equal(adapterCalls, 0);
  assert.equal(failures.length, 0);
});

test("execution service records provider failures without secrets", async () => {
  const { payload, payloadHash } = createCalendarApprovalPayload(eventInput());
  const failures = [];
  const store = {
    claimApprovedAction: async () => ({ userId: "u1", status: "executing", actionType: "calendar.create", account: googleAccount, payload, approvedPayloadHash: payloadHash, idempotencyKey: "idem-fail" }),
    getReceiptByIdempotencyKey: async () => null,
    completeAction: async () => null,
    failAction: async (value) => failures.push(value),
  };
  const error = Object.assign(new Error("provider unavailable"), { status: 503, code: "backendError", retryAfterMs: 2000 });
  const service = createCalendarExecutionService({ actionStore: store, adapters: { google: { provider: "google", execute: async () => { throw error; } } } });
  await assert.rejects(() => service.execute({ userId: "u1", actionId: "a1" }), /provider unavailable/);
  assert.deepEqual(failures[0].error, { message: "provider unavailable", code: "backendError", status: 503, retryAfterMs: 2000 });
  assert.equal(JSON.stringify(failures).includes("token"), false);
});
