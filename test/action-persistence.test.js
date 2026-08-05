import test from "node:test";
import assert from "node:assert/strict";
import {
  hashActionPayload,
  sealActionPayload,
  openActionPayload,
  buildChainedAuditEvent,
} from "../src/actions/action-persistence.js";

const key = Buffer.alloc(32, 7);
const baseAction = {
  id: "action-1",
  userId: "user-1",
  providerAccountId: "account-1",
  actionType: "mail.reply",
  payloadRevision: 1,
  revision: 1,
  status: "draft",
};

test("action payload hashing is stable across object key order", () => {
  assert.equal(
    hashActionPayload({ body: "hello", recipients: ["a@example.com"] }),
    hashActionPayload({ recipients: ["a@example.com"], body: "hello" }),
  );
});

test("encrypted action payload is bound to owner, account, type, and payload revision", () => {
  const payload = { body: "Approved body", to: ["a@example.com"] };
  const sealed = sealActionPayload({
    payload,
    key,
    actionId: baseAction.id,
    userId: baseAction.userId,
    accountId: baseAction.providerAccountId,
    actionType: baseAction.actionType,
    payloadRevision: 1,
  });
  const action = { ...baseAction, payloadHash: sealed.payloadHash };
  assert.deepEqual(openActionPayload({ envelope: sealed.envelope, key, action }), payload);
  assert.throws(
    () => openActionPayload({ envelope: sealed.envelope, key, action: { ...action, userId: "other-user" } }),
    /context mismatch: userId/,
  );
  assert.throws(
    () => openActionPayload({ envelope: sealed.envelope, key, action: { ...action, payloadRevision: 2 } }),
    /context mismatch: payloadRevision/,
  );
});

test("action state revision can advance without invalidating an unchanged encrypted payload", () => {
  const payload = { body: "Approved body" };
  const sealed = sealActionPayload({
    payload,
    key,
    actionId: baseAction.id,
    userId: baseAction.userId,
    accountId: baseAction.providerAccountId,
    actionType: baseAction.actionType,
    payloadRevision: 1,
  });
  const approvedAction = {
    ...baseAction,
    payloadHash: sealed.payloadHash,
    revision: 3,
    payloadRevision: 1,
    status: "approved",
  };
  assert.deepEqual(openActionPayload({ envelope: sealed.envelope, key, action: approvedAction }), payload);
});

test("ciphertext and envelope metadata tampering fail closed", () => {
  const sealed = sealActionPayload({
    payload: { body: "Original" },
    key,
    actionId: baseAction.id,
    userId: baseAction.userId,
    accountId: baseAction.providerAccountId,
    actionType: baseAction.actionType,
    payloadRevision: 1,
  });
  const action = { ...baseAction, payloadHash: sealed.payloadHash };
  const tamperedCiphertext = { ...sealed.envelope, ciphertext: `${sealed.envelope.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => openActionPayload({ envelope: tamperedCiphertext, key, action }));
  const tamperedContext = { ...sealed.envelope, context: { ...sealed.envelope.context, actionType: "calendar.create" } };
  assert.throws(() => openActionPayload({ envelope: tamperedContext, key, action }), /context mismatch: actionType/);
});

test("audit events form a deterministic tamper-evident chain", () => {
  const action = { ...baseAction, payloadHash: hashActionPayload({ body: "hello" }) };
  const first = buildChainedAuditEvent({
    action,
    actorId: "user-1",
    eventType: "outbound_action.created",
    now: new Date("2026-08-05T17:00:00.000Z"),
  });
  const second = buildChainedAuditEvent({
    action: { ...action, status: "pending_approval", revision: 2 },
    actorId: "user-1",
    eventType: "outbound_action.pending_approval",
    previousEventHash: first.eventHash,
    now: new Date("2026-08-05T17:01:00.000Z"),
  });
  assert.equal(second.previousEventHash, first.eventHash);
  const changed = buildChainedAuditEvent({
    action: { ...action, status: "pending_approval", revision: 2 },
    actorId: "user-1",
    eventType: "outbound_action.pending_approval",
    metadata: { forged: true },
    previousEventHash: first.eventHash,
    now: new Date("2026-08-05T17:01:00.000Z"),
  });
  assert.notEqual(changed.eventHash, second.eventHash);
});
