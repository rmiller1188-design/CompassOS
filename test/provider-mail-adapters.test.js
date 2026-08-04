import test from "node:test";
import assert from "node:assert/strict";
import { createGmailMailAdapter, createMicrosoftMailAdapter, providerCursor } from "../src/sync/provider-mail-adapters.js";

function response(body, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] || null }, async json() { return body; } };
}

test("gmail bootstrap paginates and checkpoints profile history", async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes("/messages?")) return response({ messages: [{ id: "m1" }] });
    if (url.includes("/messages/m1")) return response({ id: "m1", threadId: "t1", internalDate: "1760000000000", labelIds: ["INBOX"], snippet: "hello", payload: { headers: [{ name: "From", value: "A <a@example.com>" }, { name: "To", value: "b@example.com" }, { name: "Subject", value: "Hi" }] } });
    if (url.endsWith("/profile")) return response({ historyId: "900" });
    throw new Error(`Unexpected ${url}`);
  };
  const adapter = createGmailMailAdapter({ fetchFn, getAccessToken: async () => "token" });
  const page = await adapter.fetchMailPage({ account: { id: "a1" }, cursor: null, mode: "bootstrap" });
  assert.equal(page.items.length, 1);
  assert.equal(providerCursor.decode(page.checkpoint).historyId, "900");
  const normalized = adapter.normalizeMessage({ id: "a1" }, page.items[0]);
  assert.equal(normalized.provider, "google");
  assert.equal(normalized.from, "a@example.com");
  assert.equal(calls.length, 3);
});

test("gmail history sync deduplicates message ids and advances history", async () => {
  let messageGets = 0;
  const fetchFn = async (url) => {
    if (url.includes("/history?")) return response({ historyId: "902", history: [{ messagesAdded: [{ message: { id: "m2" } }, { message: { id: "m2" } }] }] });
    if (url.includes("/messages/m2")) { messageGets += 1; return response({ id: "m2", threadId: "t2", internalDate: "1760000000000", payload: { headers: [{ name: "From", value: "a@example.com" }] } }); }
    throw new Error(`Unexpected ${url}`);
  };
  const adapter = createGmailMailAdapter({ fetchFn, getAccessToken: async () => "token" });
  const page = await adapter.fetchMailPage({ account: { id: "a1" }, cursor: providerCursor.encode({ historyId: "900" }), mode: "incremental" });
  assert.equal(page.items.length, 1);
  assert.equal(messageGets, 1);
  assert.equal(providerCursor.decode(page.checkpoint).historyId, "902");
});

test("graph delta preserves opaque next and delta links", async () => {
  const next = "https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=abc";
  const delta = "https://graph.microsoft.com/v1.0/me/messages/delta?$deltatoken=xyz";
  const fetchFn = async (url) => response(url.includes("skiptoken") ? { value: [], "@odata.deltaLink": delta } : { value: [{ id: "g1", conversationId: "c1", from: { emailAddress: { address: "A@EXAMPLE.COM" } }, sentDateTime: "2026-08-03T12:00:00Z", receivedDateTime: "2026-08-03T12:00:01Z" }], "@odata.nextLink": next });
  const adapter = createMicrosoftMailAdapter({ fetchFn, getAccessToken: async () => "token" });
  const first = await adapter.fetchMailPage({ account: { id: "a2" }, cursor: null, mode: "bootstrap" });
  assert.equal(providerCursor.decode(first.nextCursor).deltaUrl, next);
  assert.equal(adapter.normalizeMessage({ id: "a2" }, first.items[0]).provider, "microsoft");
  const second = await adapter.fetchMailPage({ account: { id: "a2" }, cursor: first.nextCursor, mode: "incremental" });
  assert.equal(providerCursor.decode(second.checkpoint).deltaUrl, delta);
});

test("provider failures expose status and retry-after", async () => {
  const adapter = createMicrosoftMailAdapter({ fetchFn: async () => response({ error: { code: "TooManyRequests", message: "slow down" } }, 429, { "retry-after": "7" }), getAccessToken: async () => "token" });
  await assert.rejects(() => adapter.fetchMailPage({ account: { id: "a" }, cursor: null }), (error) => error.status === 429 && error.retryAfterMs === 7000);
});
