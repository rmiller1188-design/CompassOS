import test from "node:test";
import assert from "node:assert/strict";
import { computeBackoffMs, createRetryWorker } from "../src/sync/retry-worker.js";

function createClient(jobs) {
  const writes = [];
  return {
    writes,
    async rpc(name, args) {
      assert.equal(name, "claim_sync_retry_jobs");
      assert.equal(args.p_worker_id, "worker-a");
      return { data: jobs, error: null };
    },
    from(table) {
      return {
        insert(payload) {
          writes.push({ table, type: "insert", payload });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) {
          const operation = { table, type: "update", payload, filters: [] };
          writes.push(operation);
          const chain = {
            eq(column, value) {
              operation.filters.push([column, value]);
              return chain;
            },
            then(resolve, reject) {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  };
}

test("computes bounded exponential retry delay", () => {
  assert.equal(computeBackoffMs(1), 1000);
  assert.equal(computeBackoffMs(3), 4000);
  assert.equal(computeBackoffMs(99), 15 * 60 * 1000);
});

test("marks successful leased jobs complete", async () => {
  const client = createClient([{ id: 1, attempts: 0 }]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => {} });
  const result = await worker.runOnce();
  assert.deepEqual(result, { claimed: 1, succeeded: 1, rescheduled: 0, deadLettered: 0 });
  assert.equal(client.writes[0].table, "sync_retry_jobs");
  assert.equal(client.writes[0].payload.status, "succeeded");
});

test("reschedules transient failures before the attempt ceiling", async () => {
  const now = new Date("2026-08-04T00:00:00.000Z");
  const client = createClient([{ id: 2, attempts: 1, reason: "provider_transient" }]);
  const worker = createRetryWorker({ client, workerId: "worker-a", now: () => now, execute: async () => { throw new Error("temporary"); } });
  const result = await worker.runOnce();
  assert.equal(result.rescheduled, 1);
  assert.equal(client.writes[0].payload.status, "pending");
  assert.equal(client.writes[0].payload.attempts, 2);
  assert.equal(client.writes[0].payload.reason, "provider_transient");
  assert.equal(client.writes[0].payload.last_error, "Provider synchronization is temporarily unavailable");
  assert.equal(client.writes[0].payload.available_at, "2026-08-04T00:00:02.000Z");
});

test("never persists raw executor diagnostics when rescheduling", async () => {
  const secret = "Bearer secret-token cursor=https://provider.example/messages?user=person@example.com";
  const client = createClient([{ id: 4, attempts: 0, reason: "rate_limited" }]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => { throw new Error(secret); } });
  await worker.runOnce();
  const payload = JSON.stringify(client.writes);
  assert.doesNotMatch(payload, /secret-token|provider\.example|person@example\.com/);
  assert.match(payload, /Provider rate limit delayed synchronization/);
});

test("unknown retry reasons fail closed to the stable generic failure", async () => {
  const client = createClient([{ id: 5, attempts: 0, reason: "raw_provider_payload:person@example.com" }]);
  const worker = createRetryWorker({ client, workerId: "worker-a", execute: async () => { throw new Error("opaque provider detail"); } });
  await worker.runOnce();
  assert.equal(client.writes[0].payload.reason, "sync_failure");
  assert.equal(client.writes[0].payload.last_error, "Synchronization failed");
  assert.doesNotMatch(JSON.stringify(client.writes[0].payload), /person@example\.com|opaque provider detail/);
});

test("promotes exhausted jobs to owner-visible dead letters using safe diagnostics", async () => {
  const job = { id: 3, user_id: "user-1", account_id: "account-1", resource: "gmail_history", reason: "provider_transient", attempts: 4 };
  const client = createClient([job]);
  const worker = createRetryWorker({ client, workerId: "worker-a", maxAttempts: 5, execute: async () => { throw new Error("still failing Bearer abc123 person@example.com"); } });
  const result = await worker.runOnce();
  assert.equal(result.deadLettered, 1);
  assert.equal(client.writes[0].table, "sync_dead_letters");
  assert.equal(client.writes[0].payload.source_retry_job_id, 3);
  assert.equal(client.writes[0].payload.reason, "provider_transient");
  assert.equal(client.writes[0].payload.last_error, "Provider synchronization is temporarily unavailable");
  assert.equal(client.writes[1].payload.status, "dead_lettered");
  assert.equal(client.writes[1].payload.last_error, "Provider synchronization is temporarily unavailable");
  assert.doesNotMatch(JSON.stringify(client.writes), /abc123|person@example\.com|still failing/);
});

test("dead letters sanitize unknown stored reasons instead of copying them forward", async () => {
  const job = { id: 6, user_id: "user-1", account_id: "account-1", resource: "graph_mail_delta", reason: "provider said token=xyz", attempts: 4 };
  const client = createClient([job]);
  const worker = createRetryWorker({ client, workerId: "worker-a", maxAttempts: 5, execute: async () => { throw new Error("another raw failure"); } });
  await worker.runOnce();
  assert.equal(client.writes[0].payload.reason, "sync_failure");
  assert.equal(client.writes[0].payload.last_error, "Synchronization failed");
  assert.equal(client.writes[1].payload.reason, "sync_failure");
  assert.equal(client.writes[1].payload.last_error, "Synchronization failed");
  assert.doesNotMatch(JSON.stringify(client.writes), /token=xyz|another raw failure/);
});
