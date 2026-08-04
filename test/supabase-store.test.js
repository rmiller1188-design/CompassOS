import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseMailSyncStore } from "../src/sync/supabase-store.js";

class FakeQuery {
  constructor(client, table) { this.client = client; this.table = table; this.filters = []; this.operation = "select"; this.payload = null; }
  select() { this.operation = "select"; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  maybeSingle() { return Promise.resolve(this.client.respond(this)); }
  upsert(payload, options) { this.operation = "upsert"; this.payload = payload; this.options = options; return Promise.resolve(this.client.respond(this)); }
  insert(payload) { this.operation = "insert"; this.payload = payload; return Promise.resolve(this.client.respond(this)); }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  then(resolve, reject) { return Promise.resolve(this.client.respond(this)).then(resolve, reject); }
}

class FakeClient {
  constructor() { this.calls = []; this.cursor = null; }
  from(table) { return new FakeQuery(this, table); }
  respond(query) {
    this.calls.push({ table: query.table, operation: query.operation, payload: query.payload, filters: query.filters, options: query.options });
    if (query.table === "sync_cursors" && query.operation === "select") return { data: this.cursor, error: null };
    return { data: null, error: null };
  }
}

const account = { id: "account-1", provider: "google" };
const message = {
  accountId: "account-1", provider: "google", providerMessageId: "m1", threadKey: "t1",
  internetMessageId: "<m1@example.com>", subject: "Project", snippet: "Status",
  from: "sender@example.com", to: ["owner@example.com"], cc: [],
  sentAt: "2026-08-03T18:00:00.000Z", receivedAt: "2026-08-03T18:00:00.000Z",
  isRead: false, hasAttachments: true, rawRef: { id: "m1" },
};

test("maps generic mail cursor to provider-specific Gmail history resource", async () => {
  const client = new FakeClient();
  client.cursor = { cursor: "123", watermark: "2026-08-03T18:00:00.000Z" };
  const store = createSupabaseMailSyncStore({ client, userId: "user-1", account });
  assert.equal((await store.getCursor("account-1", "mail")).cursor, "123");
  assert.deepEqual(client.calls[0].filters, [["account_id", "account-1"], ["resource", "gmail_history"]]);
});

test("upserts account-scoped messages and derived threads", async () => {
  const client = new FakeClient();
  const store = createSupabaseMailSyncStore({ client, userId: "user-1", account });
  await store.upsertMessages("account-1", [message]);
  const messageCall = client.calls.find((call) => call.table === "messages");
  const threadCall = client.calls.find((call) => call.table === "message_threads");
  assert.equal(messageCall.payload[0].user_id, "user-1");
  assert.equal(messageCall.payload[0].provider_message_id, "m1");
  assert.equal(threadCall.payload[0].thread_key, "t1");
  assert.equal(threadCall.payload[0].unread_count, 1);
  assert.deepEqual(threadCall.payload[0].participant_emails.sort(), ["owner@example.com", "sender@example.com"]);
});

test("rejects cross-account writes before calling Supabase", async () => {
  const client = new FakeClient();
  const store = createSupabaseMailSyncStore({ client, userId: "user-1", account });
  await assert.rejects(() => store.upsertMessages("account-2", [message]), /Account scope violation/);
  assert.equal(client.calls.length, 0);
});

test("queues retry jobs for retryable sync failures", async () => {
  const client = new FakeClient();
  const now = () => new Date("2026-08-03T19:00:00.000Z");
  const store = createSupabaseMailSyncStore({ client, userId: "user-1", account, now });
  await store.recordSync("account-1", {
    resource: "mail", status: "failed", mode: "incremental", pages: 2, written: 4,
    retryable: true, retryAfterMs: 60000, reason: "rate_limited", message: "429",
  });
  const retry = client.calls.find((call) => call.table === "sync_retry_jobs");
  assert.equal(retry.payload.resource, "gmail_history");
  assert.equal(retry.payload.available_at, "2026-08-03T19:01:00.000Z");
});

test("reauthorization transition is constrained by account and user", async () => {
  const client = new FakeClient();
  const store = createSupabaseMailSyncStore({ client, userId: "user-1", account, now: () => new Date("2026-08-03T19:00:00.000Z") });
  await store.markReauthorizationRequired("account-1");
  const call = client.calls.find((entry) => entry.table === "connected_accounts");
  assert.equal(call.payload.status, "reauth_required");
  assert.deepEqual(call.filters, [["id", "account-1"], ["user_id", "user-1"]]);
});
