import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  assertRetryAdmission,
  buildReconciliationAdjudication,
  verifyReconciliationAdjudication,
} from '../src/actions/reconciliation-adjudication.js';

const NOW = new Date('2026-08-07T19:00:00.000Z');

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function reconciliation(overrides = {}) {
  return {
    actionId: 'act_1',
    userId: 'user_1',
    accountId: 'acct_1',
    provider: 'google',
    actionType: 'mail.reply',
    payloadHash: 'payload_hash',
    payloadRevision: 4,
    approvalRevision: 4,
    idempotencyKeyHash: hash('old-key'),
    status: 'manual_review',
    ...overrides,
  };
}

function retryAdjudication(overrides = {}) {
  return buildReconciliationAdjudication({
    reconciliation: reconciliation(),
    reviewerId: 'reviewer_1',
    outcome: 'retry_eligible',
    evidenceKind: 'provider_confirmed_absence',
    evidenceRef: 'provider-search:2026-08-07T19:00Z',
    now: NOW,
    ...overrides,
  });
}

test('manual adjudication is deterministically bound to case, reviewer, and evidence', () => {
  const decision = retryAdjudication();
  assert.equal(decision.outcome, 'retry_eligible');
  assert.equal(decision.payloadHash, 'payload_hash');
  assert.equal(decision.approvalRevision, 4);
  assert.equal(decision.reviewerId, 'reviewer_1');
  assert.equal(decision.decisionHash.length, 64);
  assert.equal(verifyReconciliationAdjudication(decision), true);
});

test('tampering with adjudication invalidates integrity', () => {
  const decision = retryAdjudication();
  assert.equal(verifyReconciliationAdjudication({ ...decision, evidenceRef: 'changed' }), false);
});

test('retry eligibility requires provider-confirmed absence evidence', () => {
  assert.throws(() => retryAdjudication({ evidenceKind: 'reviewer_guess' }), /provider-confirmed absence/);
});

test('confirmed success requires a provider receipt', () => {
  assert.throws(() => buildReconciliationAdjudication({
    reconciliation: reconciliation(),
    reviewerId: 'reviewer_1',
    outcome: 'confirmed_succeeded',
    evidenceKind: 'provider_receipt',
    evidenceRef: 'lookup-1',
    now: NOW,
  }), /provider receipt/);
});

test('retry requires fresh approval, unchanged payload, and new idempotency key', () => {
  const decision = retryAdjudication();
  const action = {
    id: 'act_1',
    userId: 'user_1',
    providerAccountId: 'acct_1',
    status: 'approved',
    payloadHash: 'payload_hash',
    approvedPayloadHash: 'payload_hash',
    payloadRevision: 4,
    approvalRevision: 5,
  };
  const admission = assertRetryAdmission({
    reconciliation: reconciliation(),
    adjudication: decision,
    action,
    newIdempotencyKeyHash: hash('new-key'),
    now: new Date('2026-08-07T19:05:00.000Z'),
  });
  assert.equal(admission.allowed, true);
  assert.equal(admission.priorApprovalRevision, 4);
  assert.equal(admission.retryApprovalRevision, 5);
  assert.equal(admission.adjudicationHash, decision.decisionHash);
});

test('same idempotency key cannot be reused after ambiguous execution', () => {
  const decision = retryAdjudication();
  assert.throws(() => assertRetryAdmission({
    reconciliation: reconciliation(),
    adjudication: decision,
    action: {
      id: 'act_1', userId: 'user_1', providerAccountId: 'acct_1', status: 'approved',
      payloadHash: 'payload_hash', approvedPayloadHash: 'payload_hash', payloadRevision: 4, approvalRevision: 5,
    },
    newIdempotencyKeyHash: hash('old-key'),
    now: new Date('2026-08-07T19:05:00.000Z'),
  }), /newly derived idempotency key/);
});

test('retry fails closed on stale approval, payload mutation, or expired grant', () => {
  const decision = retryAdjudication({ retryGrantTtlMs: 60_000 });
  const baseAction = {
    id: 'act_1', userId: 'user_1', providerAccountId: 'acct_1', status: 'approved',
    payloadHash: 'payload_hash', approvedPayloadHash: 'payload_hash', payloadRevision: 4, approvalRevision: 5,
  };
  const args = {
    reconciliation: reconciliation(),
    adjudication: decision,
    newIdempotencyKeyHash: hash('new-key'),
    now: new Date('2026-08-07T19:00:30.000Z'),
  };
  assert.throws(() => assertRetryAdmission({ ...args, action: { ...baseAction, approvalRevision: 4 } }), /newer explicit approval/);
  assert.throws(() => assertRetryAdmission({ ...args, action: { ...baseAction, payloadHash: 'changed', approvedPayloadHash: 'changed' } }), /cannot mutate/);
  assert.throws(() => assertRetryAdmission({ ...args, action: baseAction, now: new Date('2026-08-07T19:02:00.000Z') }), /expired/);
});

test('closed-no-retry decisions can never admit a retry', () => {
  const decision = buildReconciliationAdjudication({
    reconciliation: reconciliation(), reviewerId: 'reviewer_1', outcome: 'closed_no_retry',
    evidenceKind: 'manual_inspection', evidenceRef: 'case-note-1', now: NOW,
  });
  assert.throws(() => assertRetryAdmission({
    reconciliation: reconciliation(), adjudication: decision,
    action: { id: 'act_1', userId: 'user_1', providerAccountId: 'acct_1', status: 'approved', payloadHash: 'payload_hash', approvedPayloadHash: 'payload_hash', payloadRevision: 4, approvalRevision: 5 },
    newIdempotencyKeyHash: hash('new-key'), now: NOW,
  }), /does not permit retry/);
});
