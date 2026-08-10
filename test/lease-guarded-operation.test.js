import test from 'node:test';
import assert from 'node:assert/strict';

import { runWithLeaseHeartbeat, getLeaseGuardedOperationPolicy } from '../src/sync/lease-guarded-operation.js';
import { runIncrementalMailSync } from '../src/sync/mail-incremental.js';
import { createMicrosoftMailAdapter } from '../src/sync/provider-mail-adapters.js';

const account = Object.freeze({ id: '11111111-1111-1111-1111-111111111111', provider: 'microsoft', status: 'active' });
const now = () => new Date('2026-08-10T16:00:00.000Z');

test('unguarded provider operation preserves legacy execution path', async () => {
  const result = await runWithLeaseHeartbeat({
    operation: async ({ signal }) => {
      assert.equal(signal, undefined);
      return 'ok';
    },
  });
  assert.equal(result, 'ok');
});

test('heartbeat loss aborts an in-flight provider operation and returns the lease failure', async () => {
  const leaseFailure = Object.assign(new Error('lease lost'), { code: 'SYNC_LEASE_LOST', retryable: true, retryAfterMs: 5000 });
  let aborted = false;
  const result = runWithLeaseHeartbeat({
    heartbeatIntervalMs: 250,
    wait: async () => undefined,
    heartbeatLease: async () => { throw leaseFailure; },
    operation: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  });

  await assert.rejects(result, leaseFailure);
  assert.equal(aborted, true);
});

test('mail sync does not persist provider data or cursor after lease loss during a page request', async () => {
  let upserts = 0;
  let cursorSaves = 0;
  const syncRecords = [];
  const leaseFailure = Object.assign(new Error('backend detail'), { code: 'SYNC_LEASE_LOST', retryable: true, retryAfterMs: 5000 });
  const store = {
    getCursor: async () => null,
    upsertMessages: async () => { upserts += 1; },
    saveCursor: async () => { cursorSaves += 1; },
    recordSync: async (_accountId, record) => { syncRecords.push(record); },
  };
  const adapter = {
    fetchMailPage: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
    normalizeMessage: () => { throw new Error('normalization must not run'); },
  };

  await assert.rejects(() => runIncrementalMailSync({
    account,
    adapter,
    store,
    now,
    heartbeatIntervalMs: 250,
    heartbeatLease: async () => { throw leaseFailure; },
  }), leaseFailure);

  assert.equal(upserts, 0);
  assert.equal(cursorSaves, 0);
  assert.equal(syncRecords.length, 1);
  assert.equal(syncRecords[0].status, 'failed');
  assert.equal(syncRecords[0].reason, 'sync_control_transient');
});

test('Microsoft mail adapter forwards the runner AbortSignal to fetch', async () => {
  const controller = new AbortController();
  let receivedSignal;
  const adapter = createMicrosoftMailAdapter({
    getAccessToken: async () => 'token',
    fetchFn: async (_url, init) => {
      receivedSignal = init.signal;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ value: [], '@odata.deltaLink': 'delta' }) };
    },
  });

  await adapter.fetchMailPage({ account, cursor: null, mode: 'bootstrap', signal: controller.signal });
  assert.equal(receivedSignal, controller.signal);
});

test('lease-guard policy keeps heartbeat cadence below the minimum account lease duration', () => {
  assert.deepEqual(getLeaseGuardedOperationPolicy(), {
    defaultHeartbeatIntervalMs: 2000,
    minHeartbeatIntervalMs: 250,
    maxHeartbeatIntervalMs: 4000,
    providerCancellation: 'abort_signal',
    persistenceAfterLeaseLoss: 'forbidden',
  });
});

test('unsafe heartbeat intervals fail closed before provider execution', async () => {
  let providerCalls = 0;
  await assert.rejects(() => runWithLeaseHeartbeat({
    heartbeatLease: async () => undefined,
    heartbeatIntervalMs: 5000,
    operation: async () => { providerCalls += 1; },
  }), /heartbeatIntervalMs/);
  assert.equal(providerCalls, 0);
});
