import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleContactsAdapter, createMicrosoftContactsAdapter, contactsCursor } from "../src/sync/provider-contact-adapters.js";
import { runIncrementalContactsSync } from "../src/sync/contacts-incremental.js";

function response(body, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] || null }, json: async () => body };
}

test("Google contacts bootstrap paginates and emits sync token", async () => {
  const calls = [];
  const adapter = createGoogleContactsAdapter({ getAccessToken: async () => "token", fetchFn: async (url) => {
    calls.push(url);
    if (calls.length === 1) return response({ connections: [{ resourceName: "people/1", names: [{ displayName: "Ada Lovelace" }], emailAddresses: [{ value: "ADA@EXAMPLE.COM" }], metadata: { sources: [{ updateTime: "2026-08-05T00:00:00Z" }] } }], nextPageToken: "page-2" });
    return response({ connections: [], nextSyncToken: "sync-1" });
  }});
  const first = await adapter.fetchContactsPage({ account: { id: "a" }, cursor: null, mode: "bootstrap" });
  assert.ok(first.nextCursor);
  const second = await adapter.fetchContactsPage({ account: { id: "a" }, cursor: first.nextCursor, mode: "bootstrap" });
  assert.equal(contactsCursor.decode(second.checkpoint).syncToken, "sync-1");
  const normalized = adapter.normalizeContact({ id: "a" }, first.items[0]);
  assert.equal(normalized.emails[0], "ADA@EXAMPLE.COM");
  assert.match(calls[0], /requestSyncToken=true/);
});

test("Microsoft contacts preserves delta links and deletions", async () => {
  const adapter = createMicrosoftContactsAdapter({ getAccessToken: async () => "token", fetchFn: async () => response({ value: [{ id: "c1", displayName: "Removed", "@removed": { reason: "deleted" } }], "@odata.deltaLink": "https://graph.microsoft.com/delta/final" }) });
  const page = await adapter.fetchContactsPage({ account: { id: "a" }, cursor: null, mode: "bootstrap" });
  assert.equal(contactsCursor.decode(page.checkpoint).deltaUrl, "https://graph.microsoft.com/delta/final");
  assert.equal(adapter.normalizeContact({ id: "a" }, page.items[0]).isDeleted, true);
});

test("contacts orchestration advances cursor only after terminal page", async () => {
  const saved = [];
  const writes = [];
  const store = {
    getCursor: async () => null,
    upsertContacts: async (accountId, contacts) => writes.push({ accountId, contacts }),
    saveCursor: async (...args) => saved.push(args),
    recordSync: async () => {},
  };
  let call = 0;
  const adapter = {
    fetchContactsPage: async () => ++call === 1 ? { items: [{ id: "1" }], nextCursor: "next" } : { items: [{ id: "2" }], checkpoint: "final", nextCursor: null },
    normalizeContact: (account, item) => ({ accountId: account.id, provider: "google", providerContactId: item.id, displayName: `Contact ${item.id}`, updatedAt: "2026-08-05T00:00:00Z" }),
  };
  const result = await runIncrementalContactsSync({ account: { id: "a", provider: "google" }, adapter, store });
  assert.equal(result.written, 2);
  assert.equal(saved.length, 1);
  assert.equal(saved[0][2], "final");
  assert.equal(writes.length, 2);
});

test("contacts orchestration rejects repeated cursors", async () => {
  const store = { getCursor: async () => null, upsertContacts: async () => {}, saveCursor: async () => {}, recordSync: async () => {} };
  const adapter = { fetchContactsPage: async () => ({ items: [], nextCursor: "same", requestCursor: "same" }), normalizeContact: () => ({}) };
  await assert.rejects(() => runIncrementalContactsSync({ account: { id: "a", provider: "google" }, adapter, store }), /Cursor cycle/);
});
