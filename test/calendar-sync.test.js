import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleCalendarAdapter, createMicrosoftCalendarAdapter, calendarCursor } from "../src/sync/provider-calendar-adapters.js";
import { runIncrementalCalendarSync } from "../src/sync/calendar-incremental.js";

function response(body, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] || null }, json: async () => body };
}

const account = { id: "11111111-1111-1111-1111-111111111111", provider: "google" };
const googleEvent = { id: "g1", summary: "Project review", status: "confirmed", start: { dateTime: "2026-08-05T17:00:00Z", timeZone: "UTC" }, end: { dateTime: "2026-08-05T17:30:00Z", timeZone: "UTC" }, organizer: { email: "owner@example.com" }, attendees: [{ email: "pm@example.com" }], location: "Teams" };

test("Google Calendar bootstrap preserves page token and commits next sync token", async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes("pageToken=p2")) return response({ items: [], nextSyncToken: "sync-9" });
    return response({ items: [googleEvent], nextPageToken: "p2" });
  };
  const adapter = createGoogleCalendarAdapter({ fetchFn, getAccessToken: async () => "token" });
  const first = await adapter.fetchCalendarPage({ account, cursor: null, mode: "bootstrap" });
  assert.equal(first.items.length, 1);
  assert.equal(calendarCursor.decode(first.nextCursor).pageToken, "p2");
  const second = await adapter.fetchCalendarPage({ account, cursor: first.nextCursor, mode: "bootstrap" });
  assert.equal(calendarCursor.decode(second.checkpoint).syncToken, "sync-9");
  assert.match(urls[0], /singleEvents=true/);
  assert.match(urls[1], /pageToken=p2/);
});

test("Google Calendar incremental request uses durable sync token", async () => {
  let requested = "";
  const adapter = createGoogleCalendarAdapter({ fetchFn: async (url) => { requested = url; return response({ items: [googleEvent], nextSyncToken: "sync-10" }); }, getAccessToken: async () => "token" });
  const page = await adapter.fetchCalendarPage({ account, cursor: calendarCursor.encode({ syncToken: "sync-9" }), mode: "incremental" });
  assert.match(requested, /syncToken=sync-9/);
  assert.equal(calendarCursor.decode(page.checkpoint).syncToken, "sync-10");
});

test("Microsoft calendar delta preserves opaque continuation links", async () => {
  const graphAccount = { ...account, provider: "microsoft" };
  const next = "https://graph.microsoft.com/next?token=abc";
  const delta = "https://graph.microsoft.com/delta?token=xyz";
  const calls = [];
  const event = { id: "m1", subject: "Estimate handoff", start: { dateTime: "2026-08-06T15:00:00", timeZone: "UTC" }, end: { dateTime: "2026-08-06T16:00:00", timeZone: "UTC" }, organizer: { emailAddress: { address: "owner@example.com" } }, attendees: [], location: { displayName: "Office" }, isCancelled: false };
  const adapter = createMicrosoftCalendarAdapter({ now: () => new Date("2026-08-04T00:00:00Z"), getAccessToken: async () => "token", fetchFn: async (url) => { calls.push(url); return calls.length === 1 ? response({ value: [event], "@odata.nextLink": next }) : response({ value: [], "@odata.deltaLink": delta }); } });
  const first = await adapter.fetchCalendarPage({ account: graphAccount, cursor: null, mode: "bootstrap" });
  assert.equal(calendarCursor.decode(first.nextCursor).deltaUrl, next);
  const second = await adapter.fetchCalendarPage({ account: graphAccount, cursor: first.nextCursor, mode: "incremental" });
  assert.equal(calls[1], next);
  assert.equal(calendarCursor.decode(second.checkpoint).deltaUrl, delta);
  assert.equal(adapter.normalizeEvent(graphAccount, event).startsAt, "2026-08-06T15:00:00.000Z");
});

test("calendar orchestration advances checkpoint only after terminal page", async () => {
  const writes = [];
  const saved = [];
  const syncs = [];
  let call = 0;
  const adapter = {
    fetchCalendarPage: async ({ cursor }) => (++call === 1 ? { items: [googleEvent], requestCursor: cursor, nextCursor: "page-2" } : { items: [], requestCursor: cursor, nextCursor: null, checkpoint: "sync-final" }),
    normalizeEvent: (a, item) => ({ accountId: a.id, provider: "google", providerEventId: item.id, title: item.summary, startsAt: item.start.dateTime, endsAt: item.end.dateTime, timezone: "UTC", organizer: item.organizer.email, attendees: [], location: null, isCancelled: false }),
  };
  const store = { getCursor: async () => null, upsertEvents: async (id, events) => writes.push([id, events]), saveCursor: async (...args) => saved.push(args), recordSync: async (...args) => syncs.push(args) };
  const result = await runIncrementalCalendarSync({ account, adapter, store, now: () => new Date("2026-08-04T12:00:00Z") });
  assert.equal(result.pages, 2);
  assert.equal(result.written, 1);
  assert.deepEqual(saved[0].slice(0, 3), [account.id, "calendar", "sync-final"]);
  assert.equal(syncs[0][1].status, "succeeded");
  assert.equal(writes.length, 1);
});
