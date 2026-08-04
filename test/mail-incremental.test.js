import test from "node:test";
import assert from "node:assert/strict";
import { runIncrementalMailSync, SyncInvariantError, classifySyncError } from "../src/sync/mail-incremental.js";

function makeStore(cursor = null) {
  const state = { cursor, messages: [], runs: [], reauth: false };
  return {
    state,
    async getCursor() { return state.cursor ? { cursor: state.cursor } : null; },
    async upsertMessages(_accountId, messages) { state.messages.push(...messages); },
    async saveCursor(_accountId, _resource, value) { state.cursor = value; },
    async recordSync(_accountId, run) { state.runs.push(run); },
    async markReauthorizationRequired() { state.reauth = true; },
  };
}

function adapter(pages) {
  let index = 0;
  return {
    async fetchMailPage() { return pages[index++]; },
    normalizeMessage(account, item) {
      return {
        accountId: account.id,
        provider: account.provider,
        providerMessageId: item.id,
        threadKey: item.thread,
        subject: item.subject,
        from: "sender@example.com",
        to: ["owner@example.com"],
        sentAt: "2026-08-03T12:00:00Z",
        isRead: false,
      };
    },
  };
}

const account = { id: "acct-1", provider: "google" };

test("bootstraps, paginates, upserts, and persists terminal checkpoint", async () => {
  const store = makeStore();
  const result = await runIncrementalMailSync({
    account,
    store,
    adapter: adapter([
      { items: [{ id: "m1", thread: "t1", subject: "One" }], nextCursor: "page-2", requestCursor: null },
      { items: [{ id: "m2", thread: "t1", subject: "Two" }], nextCursor: null, requestCursor: "page-2", checkpoint: "history-42" },
    ]),
  });
  assert.deepEqual(result, { status: "succeeded", mode: "bootstrap", pages: 2, written: 2, cursor: "history-42" });
  assert.equal(store.state.messages.length, 2);
  assert.equal(store.state.cursor, "history-42");
  assert.equal(store.state.runs.at(-1).status, "succeeded");
});

test("uses incremental mode when a durable cursor exists", async () => {
  const store = makeStore("history-41");
  const result = await runIncrementalMailSync({
    account,
    store,
    adapter: adapter([{ items: [], nextCursor: null, checkpoint: "history-42", requestCursor: "history-41" }]),
  });
  assert.equal(result.mode, "incremental");
  assert.equal(store.state.cursor, "history-42");
});

test("rejects cursor cycles without advancing the checkpoint", async () => {
  const store = makeStore("delta-A");
  await assert.rejects(
    runIncrementalMailSync({
      account,
      store,
      adapter: adapter([
        { items: [], nextCursor: "delta-B", requestCursor: "delta-A" },
        { items: [], nextCursor: "delta-B", requestCursor: "delta-A" },
      ]),
    }),
    SyncInvariantError,
  );
  assert.equal(store.state.cursor, "delta-A");
  assert.equal(store.state.runs.at(-1).reason, "sync_invariant");
});

test("marks account for reauthorization on invalid credentials", async () => {
  const store = makeStore("delta-A");
  const failingAdapter = { async fetchMailPage() { const error = new Error("expired"); error.status = 401; throw error; } };
  await assert.rejects(runIncrementalMailSync({ account, store, adapter: failingAdapter }), /expired/);
  assert.equal(store.state.reauth, true);
  assert.equal(store.state.runs.at(-1).reason, "reauthorization_required");
});

test("classifies provider rate limits and transient errors", () => {
  assert.deepEqual(classifySyncError({ status: 429, retryAfterMs: 2500 }), { retryable: true, reason: "rate_limited", retryAfterMs: 2500 });
  assert.equal(classifySyncError({ status: 503 }).reason, "provider_transient");
  assert.equal(classifySyncError({ status: 400 }).retryable, false);
});
