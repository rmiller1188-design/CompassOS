import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReconciliationCase,
  hashIdempotencyKey,
  isAmbiguousProviderOutcome,
  reconcileProviderOutcome,
} from '../src/actions/execution-reconciliation.js';

const NOW = new Date('2026-08-07T18:00:00.000Z');

function fixture() {
  return {
    action: {
      id: 'act_1',
      userId: 'user_1',
      providerAccountId: 'acct_1',
      provider: 'google',
      actionType: 'mail.reply',
      idempotencyKey: 'secret-idempotency-key',
      payloadHash: 'payload_hash',
      payloadRevision: 4,
      approvalRevision: 4,
    },
    lease: { workerId: 'worker_1' },
  };
}

test('classifies only explicit or post-send ambiguous provider failures', () => {
  const timeout = new Error('timeout');
  timeout.code = 'ETIMEDOUT';
  assert.equal(isAmbiguousProviderOutcome(timeout), true);

  const server = new Error('server error');
  server.status = 503;
  server.requestSent = true;
  assert.equal(isAmbiguousProviderOutcome(server), true);

  const rejected = new Error('bad request');
  rejected.status = 400;
  rejected.requestSent = true;
  assert.equal(isAmbiguousProviderOutcome(rejected), false);

  const preflight = new Error('not sent');
  preflight.status = 503;
  preflight.requestSent = false;
  assert.equal(isAmbiguousProviderOutcome(preflight), false);
});

test('stores a one-way idempotency-key digest rather than the raw key', () => {
  const digest = hashIdempotencyKey('secret-idempotency-key');
  assert.equal(digest.length, 64);
  assert.notEqual(digest, 'secret-idempotency-key');
  assert.equal(digest, hashIdempotencyKey('secret-idempotency-key'));
});

test('builds a reconciliation case bound to payload, approval, worker, policy, and receipt', () => {
  const { action, lease } = fixture();
  const error = new Error('response lost');
  error.code = 'PROVIDER_OUTCOME_UNKNOWN';
  const item = buildReconciliationCase({
    action,
    lease,
    error,
    receipt: { providerMessageId: 'msg_123' },
    policyDecision: { decisionHash: 'decision_hash' },
    now: NOW,
  });
  assert.equal(item.status, 'pending');
  assert.equal(item.payloadHash, 'payload_hash');
  assert.equal(item.payloadRevision, 4);
  assert.equal(item.approvalRevision, 4);
  assert.equal(item.workerId, 'worker_1');
  assert.equal(item.providerReceiptId, 'msg_123');
  assert.equal(item.policyDecisionHash, 'decision_hash');
  assert.equal(item.observedAt, NOW.toISOString());
  assert.notEqual(item.idempotencyKeyHash, action.idempotencyKey);
});

test('rejects reconciliation for a definitive provider failure', () => {
  const { action, lease } = fixture();
  const error = new Error('permission denied');
  error.status = 403;
  assert.throws(() => buildReconciliationCase({ action, lease, error, now: NOW }), /Only ambiguous provider outcomes/);
});

test('local receipt resolves ambiguous execution as succeeded without provider lookup', async () => {
  const outcome = await reconcileProviderOutcome({
    reconciliation: { status: 'pending' },
    existingReceipt: { providerMessageId: 'msg_local' },
    lookupProviderOutcome: async () => { throw new Error('must not run'); },
  });
  assert.equal(outcome.status, 'resolved_succeeded');
  assert.equal(outcome.resolutionCode, 'LOCAL_RECEIPT_FOUND');
  assert.equal(outcome.receipt.providerMessageId, 'msg_local');
});

test('provider-confirmed success requires a durable receipt', async () => {
  await assert.rejects(() => reconcileProviderOutcome({
    reconciliation: { status: 'pending' },
    lookupProviderOutcome: async () => ({ status: 'succeeded' }),
  }), /must include a receipt/);
});

test('unknown or unsupported lookup cannot authorize automatic resend', async () => {
  const unavailable = await reconcileProviderOutcome({ reconciliation: { status: 'pending' } });
  assert.equal(unavailable.status, 'manual_review');
  assert.equal(unavailable.resolutionCode, 'PROVIDER_LOOKUP_UNAVAILABLE');

  const unknown = await reconcileProviderOutcome({
    reconciliation: { status: 'pending' },
    lookupProviderOutcome: async () => ({ status: 'unknown' }),
  });
  assert.equal(unknown.status, 'manual_review');
  assert.equal(unknown.resolutionCode, 'PROVIDER_OUTCOME_STILL_UNKNOWN');
});

test('provider-confirmed absence may resolve failed without claiming success', async () => {
  const outcome = await reconcileProviderOutcome({
    reconciliation: { status: 'pending' },
    lookupProviderOutcome: async () => ({ status: 'not_found' }),
  });
  assert.equal(outcome.status, 'resolved_failed');
  assert.equal(outcome.resolutionCode, 'PROVIDER_CONFIRMED_NOT_FOUND');
  assert.equal(outcome.receipt, null);
});
