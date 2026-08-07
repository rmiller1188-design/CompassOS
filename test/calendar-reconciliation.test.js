import test from "node:test";
import assert from "node:assert/strict";
import {
  createCalendarApprovalPayload,
  createGoogleCalendarActionAdapter,
  createMicrosoftCalendarActionAdapter,
} from "../src/actions/calendar-execution.js";
import {
  buildProviderCorrelation,
  createGoogleCalendarReconciliationLookup,
  createMicrosoftCalendarReconciliationLookup,
  createProviderReconciliationLookup,
  GOOGLE_CALENDAR_COMPASS_PROPERTY,
  MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID,
} from "../src/actions/provider-reconciliation.js";

const googleAccount = { id: "ga", provider: "google", email: "owner@example.com", status: "active", grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] };
const microsoftAccount = { id: "ma", provider: "microsoft", email: "owner@example.com", status: "active", grantedScopes: ["Calendars.ReadWrite"] };

function eventInput(overrides = {}) {
  return {
    actionType: "calendar.create",
    accountId: "ga",
    title: "Project review",
    startsAt: "2026-08-07T20:00:00Z",
    endsAt: "2026-08-07T21:00:00Z",
    timezone: "America/Los_Angeles",
    attendees: ["owner@example.com"],
    ...overrides,
  };
}

function response({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return { ok, status, json: async () => json, headers: { get: (key) => headers[key.toLowerCase()] || null } };
}

function reconciliation(idempotencyKey, actionType) {
  return { actionId: "act-1", actionType, idempotencyKeyHash: buildProviderCorrelation(idempotencyKey).digest, status: "pending" };
}

test("Google calendar create stamps the one-way correlation marker in the same provider mutation", async () => {
  const calls = [];
  const adapter = createGoogleCalendarActionAdapter({
    tokenResolver: async () => "google-secret-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ json: { id: "g-created" } });
    },
  });
  const payload = createCalendarApprovalPayload(eventInput()).payload;
  await adapter.execute({ account: googleAccount, payload, idempotencyKey: "calendar-google-create" });
  const body = JSON.parse(calls[0].init.body);
  const expected = buildProviderCorrelation("calendar-google-create").digest;
  assert.equal(body.extendedProperties.private[GOOGLE_CALENDAR_COMPASS_PROPERTY], expected);
  assert.doesNotMatch(JSON.stringify(body), /calendar-google-create/);
  assert.equal(calls[0].init.headers.authorization, "Bearer google-secret-token");
});

test("Microsoft calendar create/update bodies carry an exact single-value extended-property digest", async () => {
  const calls = [];
  const adapter = createMicrosoftCalendarActionAdapter({
    tokenResolver: async () => "graph-secret-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: 201, json: { id: "m-created" } });
    },
  });
  const payload = createCalendarApprovalPayload(eventInput({ accountId: "ma" })).payload;
  await adapter.execute({ account: microsoftAccount, payload, idempotencyKey: "calendar-ms-create" });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.singleValueExtendedProperties, [{ id: MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID, value: buildProviderCorrelation("calendar-ms-create").digest }]);
  assert.doesNotMatch(JSON.stringify(body), /calendar-ms-create/);
});

test("Google create reconciliation confirms absence only after a successful zero-match correlation query", async () => {
  let requested;
  const action = { actionType: "calendar.create", payload: createCalendarApprovalPayload(eventInput()).payload };
  const lookup = createGoogleCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async (url, init) => {
      requested = { url, init };
      return response({ json: { items: [] } });
    },
  });
  const outcome = await lookup({ account: googleAccount, reconciliation: reconciliation("g-create-absent", "calendar.create"), action });
  assert.equal(outcome.status, "not_found");
  assert.equal(outcome.evidence.matchCount, 0);
  assert.match(decodeURIComponent(requested.url), /privateExtendedProperty=compassIdempotencyHash=/);
  assert.doesNotMatch(requested.url, /g-create-absent/);
});

test("Google update reconciliation requires the exact correlation on the known event", async () => {
  const idempotencyKey = "g-update";
  const payload = createCalendarApprovalPayload(eventInput({ actionType: "calendar.update", providerEventId: "event-7" })).payload;
  const action = { actionType: payload.actionType, payload };
  const hash = buildProviderCorrelation(idempotencyKey).digest;
  const lookup = createGoogleCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { id: "event-7", extendedProperties: { private: { [GOOGLE_CALENDAR_COMPASS_PROPERTY]: hash } } } }),
  });
  const outcome = await lookup({ account: googleAccount, reconciliation: reconciliation(idempotencyKey, payload.actionType), action });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.receipt.providerEventId, "event-7");

  const missing = createGoogleCalendarReconciliationLookup({ tokenResolver: async () => "token", fetchImpl: async () => response({ status: 404, ok: false, json: {} }) });
  const unknown = await missing({ account: googleAccount, reconciliation: reconciliation(idempotencyKey, payload.actionType), action });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.evidence.reason, "RESOURCE_MISSING_NOT_PROOF_OF_ABSENCE");
});

test("Microsoft create reconciliation fails closed on duplicate extended-property matches", async () => {
  const action = { actionType: "calendar.create", payload: createCalendarApprovalPayload(eventInput({ accountId: "ma" })).payload };
  const lookup = createMicrosoftCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { value: [{ id: "one" }, { id: "two" }] } }),
  });
  const outcome = await lookup({ account: microsoftAccount, reconciliation: reconciliation("m-duplicate", "calendar.create"), action });
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.evidence.reason, "NON_UNIQUE_CORRELATION");
});

test("Microsoft update reconciliation requires the exact stamped event correlation", async () => {
  const idempotencyKey = "m-update";
  const hash = buildProviderCorrelation(idempotencyKey).digest;
  const payload = createCalendarApprovalPayload(eventInput({ accountId: "ma", actionType: "calendar.update", providerEventId: "m-event-8" })).payload;
  const action = { actionType: payload.actionType, payload };
  const lookup = createMicrosoftCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { id: "m-event-8", singleValueExtendedProperties: [{ id: MICROSOFT_CALENDAR_COMPASS_PROPERTY_ID, value: hash }] } }),
  });
  const outcome = await lookup({ account: microsoftAccount, reconciliation: reconciliation(idempotencyKey, payload.actionType), action });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.receipt.providerEventId, "m-event-8");
});

test("Microsoft response reconciliation accepts desired provider state but never infers retry eligibility from mismatch", async () => {
  const payload = createCalendarApprovalPayload({ actionType: "calendar.respond", accountId: "ma", providerEventId: "m-event-9", responseStatus: "tentative" }).payload;
  const action = { actionType: payload.actionType, payload };
  const accepted = createMicrosoftCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { id: "m-event-9", responseStatus: { response: "tentativelyAccepted" } } }),
  });
  const succeeded = await accepted({ account: microsoftAccount, reconciliation: reconciliation("m-respond", payload.actionType), action });
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.evidence.correlation, "calendar-response-desired-state");

  const mismatched = createMicrosoftCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { id: "m-event-9", responseStatus: { response: "notResponded" } } }),
  });
  const unknown = await mismatched({ account: microsoftAccount, reconciliation: reconciliation("m-respond", payload.actionType), action });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.evidence.reason, "RESPONSE_STATE_MISMATCH");
});

test("provider router chooses calendar lookup by action type and stays fail-closed without it", async () => {
  const action = { actionType: "calendar.create", payload: createCalendarApprovalPayload(eventInput()).payload };
  let called = false;
  const router = createProviderReconciliationLookup({ calendarGoogle: async ({ action: routedAction }) => { called = routedAction === action; return { status: "unknown", evidence: { reason: "TEST" } }; } });
  await router({ account: googleAccount, reconciliation: reconciliation("route-calendar", "calendar.create"), action });
  assert.equal(called, true);

  const unavailable = createProviderReconciliationLookup({});
  const outcome = await unavailable({ account: googleAccount, reconciliation: reconciliation("route-calendar", "calendar.create"), action });
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.evidence.reason, "LOOKUP_UNAVAILABLE");
});

test("calendar provider failures propagate and are never converted into confirmed absence", async () => {
  const action = { actionType: "calendar.create", payload: createCalendarApprovalPayload(eventInput()).payload };
  const lookup = createGoogleCalendarReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ ok: false, status: 503, json: { error: { message: "calendar unavailable" } } }),
  });
  await assert.rejects(() => lookup({ account: googleAccount, reconciliation: reconciliation("g-error", "calendar.create"), action }), /calendar unavailable/);
});
