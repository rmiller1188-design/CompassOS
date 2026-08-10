import test from "node:test";
import assert from "node:assert/strict";

import { createSafeSyncFailureRecord, syncFailureSafetyPolicy } from "../src/sync/sync-failure-safety.js";
import { createSupabaseMailSyncStore } from "../src/sync/supabase-store.js";
import { runIncrementalMailSync } from "../src/sync/mail-incremental.js";

const account = { id: "acct-1", provider: "google" };

function createInsertClient() {
  const inserted = [];
  return {
    inserted,
    from(table) {
      return {
        insert(row) {
          inserted.push({ table, row });
          return { data: null, error: null };
        },
      };
    },
  };
}

test("safe sync failure records never preserve caller-controlled provider text", () => {
  const failure = createSafeSyncFailureRecord({
    retryable: true,
    reason: "provider_transient",
    retryAfterMs: 5000,
    message: "Bearer super-secret-token cursor=opaque-provider-cursor",
    providerPayload: { access_token: "secret" },
  });

  assert.deepEqual(failure, {
    retryable: true,
    reason: "provider_transient",
    message: "Provider synchronization is temporarily unavailable",
    retryAfterMs: 5000,
  });
  assert.equal(JSON.stringify(failure).includes("super-secret-token"), false);
  assert.equal(JSON.stringify(failure).includes("opaque-provider-cursor"), false);
});

test("unknown persisted failure reasons fail closed to a stable generic reason", () => {
  const failure = createSafeSyncFailureRecord({ retryable: false, reason: "Bearer abc.def.ghi" });
  assert.equal(failure.reason, "sync_failure");
  assert.equal(failure.message, "Synchronization failed");
  assert.equal("retryAfterMs" in failure, false);
});

test("retry delay metadata is bounded before persistence", () => {
  const huge = createSafeSyncFailureRecord({ retryable: true, reason: "rate_limited", retryAfterMs: 86_400_000 });
  const invalid = createSafeSyncFailureRecord({ retryable: true, reason: "provider_transient", retryAfterMs: Number.NaN });
  assert.equal(huge.retryAfterMs, syncFailureSafetyPolicy.maxRetryAfterMs);
  assert.equal(invalid.retryAfterMs, syncFailureSafetyPolicy.minRetryAfterMs);
});

test("Supabase sync-run persistence replaces raw provider diagnostics with stable safe text", async () => {
  const client = createInsertClient();
  const store = createSupabaseMailSyncStore({
    client,
    userId: "user-1",
    account,
    now: () => new Date("2026-08-10T18:00:00.000Z"),
  });

  await store.recordSync(account.id, {
    resource: "mail",
    status: "failed",
    mode: "incremental",
    pages: 2,
    written: 3,
    retryable: false,
    reason: "provider_rejected",
    message: "https://gmail.googleapis.com/?access_token=raw-secret provider@example.com",
  });

  const run = client.inserted.find((entry) => entry.table === "sync_runs").row;
  assert.equal(run.reason, "provider_rejected");
  assert.equal(run.message, "Provider rejected synchronization request");
  assert.equal(JSON.stringify(run).includes("raw-secret"), false);
  assert.equal(JSON.stringify(run).includes("provider@example.com"), false);
});

test("retry queue persists only bounded stable failure diagnostics", async () => {
  const client = createInsertClient();
  const store = createSupabaseMailSyncStore({
    client,
    userId: "user-1",
    account,
    now: () => new Date("2026-08-10T18:00:00.000Z"),
  });

  await store.recordSync(account.id, {
    resource: "mail",
    status: "failed",
    mode: "incremental",
    pages: 1,
    written: 0,
    retryable: true,
    reason: "provider_transient",
    retryAfterMs: 99_999_999,
    message: "Bearer should-never-persist",
  });

  const retry = client.inserted.find((entry) => entry.table === "sync_retry_jobs").row;
  assert.equal(retry.reason, "provider_transient");
  assert.equal(retry.last_error, "Provider synchronization is temporarily unavailable");
  assert.equal(retry.available_at, "2026-08-10T18:15:00.000Z");
  assert.equal(JSON.stringify(retry).includes("should-never-persist"), false);
});

test("incremental mail runner records a safe failure while preserving the original thrown error for control flow", async () => {
  const providerError = Object.assign(new Error("Bearer provider-secret cursor=opaque-history-id"), { status: 503 });
  let recorded = null;
  const store = {
    async getCursor() { return { cursor: "history-1" }; },
    async recordSync(_accountId, run) { recorded = run; },
  };
  const adapter = {
    async fetchMailPage() { throw providerError; },
  };

  await assert.rejects(
    runIncrementalMailSync({ account, adapter, store }),
    (error) => error === providerError,
  );

  assert.equal(recorded.reason, "provider_transient");
  assert.equal(recorded.message, "Provider synchronization is temporarily unavailable");
  assert.equal(JSON.stringify(recorded).includes("provider-secret"), false);
  assert.equal(JSON.stringify(recorded).includes("opaque-history-id"), false);
});
