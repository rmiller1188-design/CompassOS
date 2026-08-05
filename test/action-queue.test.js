import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionLease,
  assertLeaseMatchesAction,
  createSupabaseActionQueue,
  executeClaimedAction,
} from "../src/actions/action-queue.js";

const action = {
  id: "action-1",
  userId: "user-1",
  providerAccountId: "account-1",
  actionType: "mail.reply",
  payloadHash: "hash-1",
  payloadRevision: 2,
  status: "approved",
  revision: 7,
};

test("builds a payload-bound execution lease", () => {
  const lease = buildExecutionLease({ action, workerId: "worker-a", leaseDurationMs: 30_000, now: new Date("2026-08-05T18:00:00Z") });
  assert.equal(lease.payloadHash, action.payloadHash);
  assert.equal(lease.payloadRevision, 2);
  assert.equal(lease.expectedRevision, 7);
  assert.equal(lease.leaseExpiresAt, "2026-08-05T18:00:30.000Z");
  assert.equal(assertLeaseMatchesAction(lease, action, new Date("2026-08-05T18:00:20Z")), true);
});

test("rejects stale, mutated, and expired leases", () => {
  const lease = buildExecutionLease({ action, workerId: "worker-a", leaseDurationMs: 30_000, now: new Date("2026-08-05T18:00:00Z") });
  assert.throws(() => assertLeaseMatchesAction(lease, { ...action, payloadHash: "changed" }, new Date("2026-08-05T18:00:01Z")), /payloadHash/);
  assert.throws(() => assertLeaseMatchesAction(lease, { ...action, payloadRevision: 3 }, new Date("2026-08-05T18:00:01Z")), /payloadRevision/);
  assert.throws(() => assertLeaseMatchesAction(lease, action, new Date("2026-08-05T18:00:30Z")), /expired/);
});

test("only approved actions may receive a lease", () => {
  assert.throws(() => buildExecutionLease({ action: { ...action, status: "draft" }, workerId: "worker-a" }), /Only approved/);
});

test("claims through the atomic service-role RPC", async () => {
  const calls = [];
  const client = {
    from() { throw new Error("not used"); },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: [{
        id: "action-1", user_id: "user-1", account_id: "account-1", action_type: "mail.reply",
        payload_hash: "hash-1", payload_revision: 2, status: "executing", revision: 8,
        lease_owner: "worker-a", lease_started_at: "2026-08-05T18:00:00.000Z", lease_expires_at: "2026-08-05T18:01:00.000Z",
      }] };
    },
  };
  const queue = createSupabaseActionQueue({ client, workerId: "worker-a", leaseDurationMs: 60_000 });
  const claim = await queue.claimNext({ actionTypes: ["mail.reply"] });
  assert.equal(claim.action.status, "executing");
  assert.equal(claim.lease.workerId, "worker-a");
  assert.deepEqual(calls[0], {
    name: "claim_next_outbound_action",
    args: { p_worker_id: "worker-a", p_lease_seconds: 60, p_action_types: ["mail.reply"] },
  });
});

test("successful execution records the provider receipt before terminal transition", async () => {
  const transitions = [];
  const claim = {
    action: { ...action, status: "executing", revision: 8 },
    lease: {
      actionId: "action-1", userId: "user-1", accountId: "account-1", workerId: "worker-a",
      payloadHash: "hash-1", payloadRevision: 2, expectedRevision: 8,
      leasedAt: "2026-08-05T18:00:00.000Z", leaseExpiresAt: "2026-08-05T18:01:00.000Z",
    },
  };
  const receipt = await executeClaimedAction({
    claim,
    now: () => new Date("2026-08-05T18:00:10Z"),
    loadPayload: async () => ({ body: "Approved body" }),
    execute: async ({ payload }) => ({ providerMessageId: `provider-${payload.body.length}` }),
    transition: async (...args) => transitions.push(args),
  });
  assert.equal(receipt.providerMessageId, "provider-13");
  assert.equal(transitions[0][1], "succeeded");
  assert.equal(transitions[0][2].expectedRevision, 8);
  assert.equal(transitions[0][2].metadata.providerReceiptId, "provider-13");
});

test("failed execution transitions once with retry metadata and rethrows", async () => {
  const transitions = [];
  const error = Object.assign(new Error("provider throttled"), { code: "THROTTLED", retryable: true });
  const claim = {
    action: { ...action, status: "executing", revision: 8 },
    lease: {
      actionId: "action-1", userId: "user-1", accountId: "account-1", workerId: "worker-a",
      payloadHash: "hash-1", payloadRevision: 2, expectedRevision: 8,
      leasedAt: "2026-08-05T18:00:00.000Z", leaseExpiresAt: "2026-08-05T18:01:00.000Z",
    },
  };
  await assert.rejects(() => executeClaimedAction({
    claim,
    now: () => new Date("2026-08-05T18:00:10Z"),
    loadPayload: async () => ({ body: "Approved body" }),
    execute: async () => { throw error; },
    transition: async (...args) => transitions.push(args),
  }), /provider throttled/);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0][1], "failed");
  assert.deepEqual(transitions[0][2].metadata, { workerId: "worker-a", errorCode: "THROTTLED", retryable: true });
});
