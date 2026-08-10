import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeBackoffMs, createRetryWorker } from "../src/sync/retry-worker.js";

const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";

function claimedJob(overrides = {}) {
  return {
    id: 1,
    attempts: 0,
    reason: "provider_transient",
    lease_owner: "worker-a",
    lease_token: LEASE_TOKEN,
    ...overrides,
  };
}

function createClient(jobs, { finalizeResult = true, finalizeError = null } = {}) {
  const writes = [];
  return {
    writes,
    async rpc(name, args) {
      if (name === "claim_sync_retry_jobs") {
        assert.equal(args.p_worker_id, "worker-a");
        writes.push({ type: "rpc", name, args });
        return { data: jobs, error: null };
      }
      if (name === "finalize_sync_retry_job") {
        writes.push({ type: "rpc", name, args });
        return finalizeError
          ? { data: null, error: finalizeError }
          : { data: finalizeResult, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

function finalization(client) {
  return client.writes.find((entry) => entry.name === "finalize_sync_retry_job");
}

test("computes bounded exponential retry delay", () => {
  assert.equal(computeBackoffMs(1), 1000);
  assert.equal(computeBackoffMs(3), 4000);
  assert.equal(computeBackoffMs(99), 15 * 60 * 1000);
});

test("marks successful leased jobs complete only through exact lease-token finalization", async () => {
  const client = createClient([claimedJob()]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => {}, now: () => new Date("2026-08-10T20:00:00.000Z") });
  const result = await worker.runOnce();
  assert.deepEqual(result, { claimed: 1, succeeded: 1, rescheduled: 0, deadLettered: 0, fenced: 0 });
  assert.deepEqual(finalization(client).args, {
    p_job_id: 1,
    p_worker_id: "worker-a",
    p_lease_token: LEASE_TOKEN,
    p_outcome: "succeeded",
    p_attempts: null,
    p_reason: null,
    p_last_error: null,
    p_available_at: null,
    p_completed_at: "2026-08-10T20:00:00.000Z",
  });
});

test("reschedules transient failures through the fenced RPC with safe diagnostics", async () => {
  const now = new Date("2026-08-04T00:00:00.000Z");
  const client = createClient([claimedJob({ id: 2, attempts: 1 })]);
  const worker = createRetryWorker({ client, workerId: "worker-a", now: () => now, execute: async () => { throw new Error("temporary"); } });
  const result = await worker.runOnce();
  assert.equal(result.rescheduled, 1);
  const args = finalization(client).args;
  assert.equal(args.p_job_id, 2);
  assert.equal(args.p_lease_token, LEASE_TOKEN);
  assert.equal(args.p_outcome, "pending");
  assert.equal(args.p_attempts, 2);
  assert.equal(args.p_reason, "provider_transient");
  assert.equal(args.p_last_error, "Provider synchronization is temporarily unavailable");
  assert.equal(args.p_available_at, "2026-08-04T00:00:02.000Z");
});

test("never persists raw executor diagnostics when rescheduling", async () => {
  const secret = "Bearer secret-token cursor=https://provider.example/messages?user=person@example.com";
  const client = createClient([claimedJob({ id: 4, reason: "rate_limited" })]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => { throw new Error(secret); } });
  await worker.runOnce();
  const payload = JSON.stringify(client.writes);
  assert.doesNotMatch(payload, /secret-token|provider\.example|person@example\.com/);
  assert.match(payload, /Provider rate limit delayed synchronization/);
});

test("unknown retry reasons fail closed to the stable generic failure", async () => {
  const client = createClient([claimedJob({ id: 5, reason: "raw_provider_payload:person@example.com" })]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => { throw new Error("opaque provider detail"); } });
  await worker.runOnce();
  const args = finalization(client).args;
  assert.equal(args.p_reason, "sync_failure");
  assert.equal(args.p_last_error, "Synchronization failed");
  assert.doesNotMatch(JSON.stringify(args), /person@example\.com|opaque provider detail/);
});

test("promotes exhausted jobs atomically through the fenced finalization RPC", async () => {
  const job = claimedJob({ id: 3, user_id: "user-1", account_id: "account-1", resource: "gmail_history", attempts: 4 });
  const client = createClient([job]);
  const worker = createRetryWorker({ client, workerId: "worker-a", maxAttempts: 5, execute: async () => { throw new Error("still failing Bearer abc123 person@example.com"); } });
  const result = await worker.runOnce();
  assert.equal(result.deadLettered, 1);
  const args = finalization(client).args;
  assert.equal(args.p_outcome, "dead_lettered");
  assert.equal(args.p_attempts, 5);
  assert.equal(args.p_reason, "provider_transient");
  assert.equal(args.p_last_error, "Provider synchronization is temporarily unavailable");
  assert.equal(client.writes.filter((entry) => entry.name === "finalize_sync_retry_job").length, 1);
  assert.doesNotMatch(JSON.stringify(client.writes), /abc123|person@example\.com|still failing/);
});

test("dead letters sanitize unknown stored reasons instead of copying them forward", async () => {
  const job = claimedJob({ id: 6, user_id: "user-1", account_id: "account-1", resource: "graph_mail_delta", reason: "provider said token=xyz", attempts: 4 });
  const client = createClient([job]);
  const worker = createRetryWorker({ client, workerId: "worker-a", maxAttempts: 5, execute: async () => { throw new Error("another raw failure"); } });
  await worker.runOnce();
  const args = finalization(client).args;
  assert.equal(args.p_reason, "sync_failure");
  assert.equal(args.p_last_error, "Synchronization failed");
  assert.doesNotMatch(JSON.stringify(client.writes), /token=xyz|another raw failure/);
});

test("stale or replaced retry lease is fenced without mutating terminal state", async () => {
  const client = createClient([claimedJob()], { finalizeResult: false });
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => {} });
  const result = await worker.runOnce();
  assert.deepEqual(result, { claimed: 1, succeeded: 0, rescheduled: 0, deadLettered: 0, fenced: 1 });
});

test("malformed claims without a lease token fail closed before executor work", async () => {
  let executions = 0;
  const client = createClient([{ id: 7, lease_owner: "worker-a", attempts: 0, reason: "provider_transient" }]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => { executions += 1; } });
  await assert.rejects(() => worker.runOnce(), (error) => error.code === "SYNC_RETRY_CLAIM_INVALID" && error.retryable === false);
  assert.equal(executions, 0);
});

test("retry backend diagnostics are sanitized at the worker control boundary", async () => {
  const client = createClient([claimedJob()], { finalizeError: { code: "XX000", message: "postgres secret tenant@example.com" } });
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => {} });
  await assert.rejects(() => worker.runOnce(), (error) => {
    assert.equal(error.code, "SYNC_RETRY_BACKEND");
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /postgres|tenant@example\.com/);
    return true;
  });
});

test("migration reclaims expired leases and fences finalization by rotating token", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260810_retry_worker_lease_fencing.sql", import.meta.url), "utf8");
  assert.match(sql, /status = 'leased' and lease_expires_at <= now\(\)/);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/);
  assert.match(sql, /lease_token = p_lease_token/);
  assert.match(sql, /lease_expires_at > now\(\)/);
  assert.match(sql, /for update;/i);
  assert.match(sql, /p_attempts <> v_job\.attempts \+ 1/);
  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /grant execute on function public\.finalize_sync_retry_job[\s\S]*to service_role/);
  assert.match(sql, /revoke all on function public\.finalize_sync_retry_job[\s\S]*from public, anon, authenticated/);
});
