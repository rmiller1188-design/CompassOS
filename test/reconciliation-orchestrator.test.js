import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProviderReconciliationEvidence,
  classifyReconciliationLookupError,
  orchestrateReconciliation,
} from '../src/actions/reconciliation-orchestrator.js';

function fixture() {
  const reconciliation = {
    actionId: 'act-1',
    userId: 'user-1',
    accountId: 'acct-1',
    provider: 'google',
    actionType: 'mail.reply',
    payloadHash: 'payload-hash',
    payloadRevision: 3,
    approvalRevision: 7,
    idempotencyKeyHash: 'idem-hash',
    status: 'pending',
    updatedAt: '2026-08-07T21:00:00.000Z',
  };
  const action = {
    id: 'act-1',
    userId: 'user-1',
    providerAccountId: 'acct-1',
    provider: 'google',
    actionType: 'mail.reply',
    payloadHash: 'payload-hash',
    payloadRevision: 3,
  };
  const account = { id: 'acct-1', provider: 'google' };
  return { reconciliation, action, account };
}

function stores() {
  const resolves = [];
  const evidence = [];
  return {
    resolves,
    evidence,
    reconciliationStore: {
      async resolve(input) {
        resolves.push(input);
        return { action_id: input.actionId, status: input.status, resolution_code: input.resolutionCode };
      },
    },
    evidenceStore: {
      async append(input) {
        evidence.push(input);
        return input;
      },
    },
  };
}

test('provider-confirmed absence is preserved for manual adjudication instead of becoming terminal retry authority', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  const result = await orchestrateReconciliation({
    reconciliation,
    action,
    account,
    lookupProviderOutcome: async () => ({ status: 'not_found', evidence: { provider: 'google', matchCount: 0 } }),
    reconciliationStore: state.reconciliationStore,
    evidenceStore: state.evidenceStore,
    now: () => new Date('2026-08-07T22:00:00.000Z'),
  });

  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'PROVIDER_CONFIRMED_ABSENCE_REQUIRES_REAPPROVAL');
  assert.equal(result.adjudicationInput.evidenceKind, 'provider_confirmed_absence');
  assert.match(result.adjudicationInput.evidenceRef, /^sha256:[a-f0-9]{64}$/);
  assert.equal(state.resolves[0].status, 'manual_review');
  assert.equal(state.evidence.length, 1);
});

test('successful provider lookup resolves with the exact provider receipt', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  const result = await orchestrateReconciliation({
    reconciliation,
    action,
    account,
    lookupProviderOutcome: async () => ({
      status: 'succeeded',
      receipt: { provider: 'google', providerMessageId: 'msg-9' },
      evidence: { provider: 'google', matchCount: 1 },
    }),
    reconciliationStore: state.reconciliationStore,
    evidenceStore: state.evidenceStore,
  });

  assert.equal(result.disposition, 'resolved_succeeded');
  assert.equal(state.resolves[0].providerReceiptId, 'msg-9');
});

test('unknown provider result becomes manual review and carries no retry-eligible evidence kind', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  const result = await orchestrateReconciliation({
    reconciliation,
    action,
    account,
    lookupProviderOutcome: async () => ({ status: 'unknown', evidence: { reason: 'NON_UNIQUE_CORRELATION', matchCount: 2 } }),
    reconciliationStore: state.reconciliationStore,
    evidenceStore: state.evidenceStore,
  });

  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.evidence.evidenceKind, 'provider_reconciliation_observation');
  assert.equal(result.adjudicationInput, undefined);
});

test('transient provider lookup failure stays pending for later lookup instead of becoming absence evidence', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  const error = Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 5000 });
  const result = await orchestrateReconciliation({
    reconciliation,
    action,
    account,
    lookupProviderOutcome: async () => { throw error; },
    reconciliationStore: state.reconciliationStore,
    evidenceStore: state.evidenceStore,
  });

  assert.equal(result.disposition, 'retry_later');
  assert.equal(result.retryAfterMs, 5000);
  assert.equal(state.resolves.length, 0);
  assert.equal(state.evidence.length, 0);
});

test('authentication lookup failure moves to manual review without generating absence evidence', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  const error = Object.assign(new Error('expired'), { status: 401 });
  const result = await orchestrateReconciliation({
    reconciliation,
    action,
    account,
    lookupProviderOutcome: async () => { throw error; },
    reconciliationStore: state.reconciliationStore,
    evidenceStore: state.evidenceStore,
  });

  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'PROVIDER_RECONNECT_REQUIRED');
  assert.equal(state.evidence.length, 0);
});

test('reconciliation fails closed on payload or account drift before provider lookup', async () => {
  const { reconciliation, action, account } = fixture();
  const state = stores();
  await assert.rejects(() => orchestrateReconciliation({
    reconciliation,
    action: { ...action, payloadHash: 'mutated' },
    account,
    lookupProviderOutcome: async () => ({ status: 'not_found' }),
    reconciliationStore: state.reconciliationStore,
  }), /payload binding mismatch/);
  assert.equal(state.resolves.length, 0);
});

test('evidence hashes are deterministic and provider tokens are not part of evidence input', () => {
  const { reconciliation } = fixture();
  const first = buildProviderReconciliationEvidence({
    reconciliation,
    outcome: { status: 'not_found', evidence: { matchCount: 0, provider: 'google' } },
    observedAt: '2026-08-07T22:00:00Z',
  });
  const second = buildProviderReconciliationEvidence({
    reconciliation,
    outcome: { status: 'not_found', evidence: { provider: 'google', matchCount: 0 } },
    observedAt: '2026-08-07T22:00:00Z',
  });
  assert.equal(first.evidenceHash, second.evidenceHash);
  assert.equal(first.evidenceKind, 'provider_confirmed_absence');
  assert.equal(JSON.stringify(first).includes('Bearer '), false);
});

test('lookup error classification never turns provider failure into confirmed absence', () => {
  assert.deepEqual(classifyReconciliationLookupError({ status: 503 }), {
    disposition: 'retry_later', resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT', retryAfterMs: null,
  });
  assert.deepEqual(classifyReconciliationLookupError({ status: 403 }), {
    disposition: 'manual_review', resolutionCode: 'PROVIDER_RECONNECT_REQUIRED', retryAfterMs: null,
  });
});
