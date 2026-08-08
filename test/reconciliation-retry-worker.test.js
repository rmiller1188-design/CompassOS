import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeReconciliationRetryPlan,
  runReconciliationRetryWorkerOnce,
} from '../src/actions/reconciliation-retry-worker.js';

function storeWithClaim(claim = { action_id: 'act-1', lease_token: 'lease-1', attempt_count: 1 }) {
  const calls = [];
  return {
    calls,
    store: {
      async claim(input) { calls.push(['claim', input]); return claim; },
      async scheduleRetry(input) { calls.push(['scheduleRetry', input]); return input; },
      async release(input) { calls.push(['release', input]); return input; },
      async exhaust(input) { calls.push(['exhaust', input]); return input; },
    },
  };
}

function context() {
  return {
    reconciliation: { actionId: 'act-1', status: 'pending' },
    action: { id: 'act-1' },
    account: { id: 'acct-1' },
  };
}

test('retry plan is deterministic, bounded, and never schedules before provider Retry-After', () => {
  const first = computeReconciliationRetryPlan({
    actionId: 'act-1', attempt: 4, retryAfterMs: 50_000,
    now: '2026-08-08T15:00:00.000Z', baseDelayMs: 5_000, maxDelayMs: 60_000,
  });
  const second = computeReconciliationRetryPlan({
    actionId: 'act-1', attempt: 4, retryAfterMs: 50_000,
    now: '2026-08-08T15:00:00.000Z', baseDelayMs: 5_000, maxDelayMs: 60_000,
  });
  assert.deepEqual(first, second);
  assert.ok(first.delayMs >= 50_000);
  assert.ok(first.delayMs <= 60_000);
});

test('idle worker performs no hydration or provider reconciliation', async () => {
  const { store, calls } = storeWithClaim(null);
  let hydrated = false;
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => { hydrated = true; },
    orchestrate: async () => { throw new Error('should not run'); },
  });
  assert.equal(result.disposition, 'idle');
  assert.equal(hydrated, false);
  assert.deepEqual(calls.map(([name]) => name), ['claim']);
});

test('transient lookup schedules a bounded later attempt and releases the active lease through the scheduling RPC', async () => {
  const { store, calls } = storeWithClaim();
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => context(),
    orchestrate: async () => ({ disposition: 'retry_later', resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT', retryAfterMs: 30_000 }),
    now: () => new Date('2026-08-08T15:00:00.000Z'),
    retryPolicy: { baseDelayMs: 5_000, maxDelayMs: 60_000 },
  });
  assert.equal(result.disposition, 'retry_scheduled');
  assert.equal(calls.some(([name]) => name === 'scheduleRetry'), true);
  assert.equal(calls.some(([name]) => name === 'release'), false);
  const scheduled = calls.find(([name]) => name === 'scheduleRetry')[1];
  assert.equal(scheduled.errorCode, 'PROVIDER_LOOKUP_TRANSIENT');
  assert.ok(new Date(scheduled.nextAttemptAt).getTime() >= new Date('2026-08-08T15:00:30.000Z').getTime());
});

test('maximum transient attempt is exhausted to manual review, never converted to provider absence', async () => {
  const { store, calls } = storeWithClaim({ action_id: 'act-1', lease_token: 'lease-8', attempt_count: 8 });
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => context(),
    orchestrate: async () => ({ disposition: 'retry_later', resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT' }),
    maxAttempts: 8,
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'PROVIDER_LOOKUP_RETRY_EXHAUSTED');
  assert.equal(calls.some(([name]) => name === 'exhaust'), true);
  assert.equal(JSON.stringify(result).includes('confirmed_absence'), false);
});

test('claim already beyond maximum attempts is exhausted without provider lookup', async () => {
  const { store, calls } = storeWithClaim({ action_id: 'act-1', lease_token: 'lease-9', attempt_count: 9 });
  let orchestrated = false;
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => context(),
    orchestrate: async () => { orchestrated = true; },
    maxAttempts: 8,
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(orchestrated, false);
  assert.equal(calls.some(([name]) => name === 'exhaust'), true);
});

test('context drift fails closed to manual review before provider reconciliation', async () => {
  const { store, calls } = storeWithClaim();
  let orchestrated = false;
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => ({ reconciliation: { actionId: 'other', status: 'pending' } }),
    orchestrate: async () => { orchestrated = true; },
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'RECONCILIATION_CONTEXT_INVALID');
  assert.equal(orchestrated, false);
  assert.equal(calls.find(([name]) => name === 'exhaust')[1].resolutionCode, 'RECONCILIATION_CONTEXT_INVALID');
});

test('orchestrator exceptions fail closed instead of being blindly retried', async () => {
  const { store, calls } = storeWithClaim();
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => context(),
    orchestrate: async () => { throw new Error('binding mismatch'); },
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'RECONCILIATION_ORCHESTRATION_FAILED');
  assert.equal(calls.some(([name]) => name === 'scheduleRetry'), false);
});

test('terminal reconciliation releases the lease and preserves the orchestrator disposition', async () => {
  const { store, calls } = storeWithClaim();
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-a', retryStore: store,
    hydrate: async () => context(),
    orchestrate: async () => ({ disposition: 'resolved_succeeded', resolutionCode: 'PROVIDER_CONFIRMED_SUCCESS' }),
  });
  assert.equal(result.disposition, 'resolved_succeeded');
  assert.equal(result.actionId, 'act-1');
  assert.equal(calls.some(([name]) => name === 'release'), true);
});

test('invalid retry policy rejects malformed bounds instead of producing unsafe scheduling', () => {
  assert.throws(() => computeReconciliationRetryPlan({ actionId: 'act-1', attempt: 1, baseDelayMs: 10_000, maxDelayMs: 5_000 }), /cannot exceed/);
  assert.throws(() => computeReconciliationRetryPlan({ actionId: 'act-1', attempt: 1, retryAfterMs: -1 }), /non-negative/);
});
