import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildManualReconciliationDecision,
  dispositionForManualDecision,
  hashReviewEvidence,
  verifyManualReconciliationDecision,
} from '../src/actions/reconciliation-review.js';

const NOW = new Date('2026-08-07T19:00:00.000Z');

function fixture() {
  return {
    reconciliation: {
      actionId: 'act_1',
      userId: 'user_1',
      accountId: 'acct_1',
      payloadHash: 'payload_hash',
      payloadRevision: 4,
      approvalRevision: 4,
      status: 'manual_review',
      updatedAt: '2026-08-07T18:30:00.000Z',
    },
    action: {
      id: 'act_1',
      userId: 'user_1',
      providerAccountId: 'acct_1',
      provider: 'google',
      actionType: 'mail.reply',
      payloadHash: 'payload_hash',
      payloadRevision: 4,
      approvalRevision: 4,
      status: 'failed',
    },
  };
}

test('manual success requires evidence and never directly authorizes provider execution', () => {
  const { reconciliation, action } = fixture();
  assert.throws(() => buildManualReconciliationDecision({
    reconciliation, action, command: 'confirm_succeeded', reviewerId: 'user_1', reviewNote: 'checked sent items', now: NOW,
  }), /requires provider receipt or external evidence/);

  const decision = buildManualReconciliationDecision({
    reconciliation,
    action,
    command: 'confirm_succeeded',
    reviewerId: 'user_1',
    reviewNote: 'verified provider sent item',
    evidence: 'provider-screen-capture-digest-source',
    now: NOW,
  });
  assert.equal(decision.authorizesProviderExecution, false);
  assert.equal(decision.requiresFreshApproval, false);
  assert.equal(decision.evidenceHash, hashReviewEvidence('provider-screen-capture-digest-source'));
  assert.equal(verifyManualReconciliationDecision(decision), true);
  assert.equal(dispositionForManualDecision(decision).reconciliationStatus, 'resolved_succeeded');
});

test('manual close failed cannot schedule or authorize retry', () => {
  const { reconciliation, action } = fixture();
  const decision = buildManualReconciliationDecision({
    reconciliation, action, command: 'close_failed', reviewerId: 'user_1', reviewNote: 'close without retry', now: NOW,
  });
  const disposition = dispositionForManualDecision(decision);
  assert.equal(disposition.reconciliationStatus, 'resolved_failed');
  assert.equal(disposition.retryRequest, null);
  assert.equal(decision.authorizesProviderExecution, false);
});

test('retry preparation always requires a fresh approval and does not execute', () => {
  const { reconciliation, action } = fixture();
  const decision = buildManualReconciliationDecision({
    reconciliation, action, command: 'prepare_retry', reviewerId: 'user_1', reviewNote: 'prepare a new reviewed attempt', now: NOW,
  });
  const disposition = dispositionForManualDecision(decision);
  assert.equal(decision.requiresFreshApproval, true);
  assert.equal(decision.authorizesProviderExecution, false);
  assert.equal(disposition.reconciliationStatus, 'manual_review');
  assert.equal(disposition.retryRequest.requiresFreshApproval, true);
  assert.equal(disposition.retryRequest.authorizesProviderExecution, false);
  assert.equal(disposition.retryRequest.sourceDecisionHash, decision.decisionHash);
});

test('stale payload, approval, owner, account, or action status fail closed', () => {
  for (const mutate of [
    ({ reconciliation }) => { reconciliation.payloadHash = 'changed'; },
    ({ reconciliation }) => { reconciliation.payloadRevision = 5; },
    ({ reconciliation }) => { reconciliation.approvalRevision = 5; },
    ({ reconciliation }) => { reconciliation.userId = 'other'; },
    ({ reconciliation }) => { reconciliation.accountId = 'other'; },
    ({ action }) => { action.status = 'approved'; },
  ]) {
    const item = fixture();
    mutate(item);
    assert.throws(() => buildManualReconciliationDecision({
      ...item, command: 'close_failed', reviewerId: 'user_1', reviewNote: 'review', now: NOW,
    }));
  }
});

test('decision hash is deterministic and tampering is detected', () => {
  const item = fixture();
  const input = { ...item, command: 'prepare_retry', reviewerId: 'user_1', reviewNote: 'reviewed', now: NOW };
  const first = buildManualReconciliationDecision(input);
  const second = buildManualReconciliationDecision(input);
  assert.equal(first.decisionHash, second.decisionHash);
  assert.equal(verifyManualReconciliationDecision(first), true);
  assert.equal(verifyManualReconciliationDecision({ ...first, reviewNote: 'changed after approval' }), false);
});

test('invalid case time and unsupported commands are rejected', () => {
  const item = fixture();
  item.reconciliation.updatedAt = 'not-a-date';
  assert.throws(() => buildManualReconciliationDecision({
    ...item, command: 'close_failed', reviewerId: 'user_1', reviewNote: 'review', now: NOW,
  }), /valid date/);

  const fresh = fixture();
  assert.throws(() => buildManualReconciliationDecision({
    ...fresh, command: 'force_resend', reviewerId: 'user_1', reviewNote: 'review', now: NOW,
  }), /Unsupported/);
});
