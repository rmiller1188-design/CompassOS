import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAccountSyncLease,
  createSupabaseAccountSyncLeaseManager,
  getAccountSyncLeasePolicy,
} from '../src/sync/account-sync-lease.js';
import { createUnifiedSyncCoordinator } from '../src/sync/unified-sync-coordinator.js';
import { runIncrementalMailSync } from '../src/sync/mail-incremental.js';

const account = Object.freeze({ id: '11111111-1111-1111-1111-111111111111', provider: 'google', status: 'active' });
const now = () => new Date('2026-08-09T22:00:00.000Z');

function leaseRow(overrides = {}) {
  return {
    account_id: account.id,
    provider: account.provider,
    lease_owner: 'worker-a',
    lease_token: '22222222-2222-2222-2222-222222222222',
    lease_started_at: '2026-08-09T21:59:00.000Z',
    lease_expires_at: '2026-08-09T22:02:00.000Z',
    ...overrides,
  };
}

function lease(overrides = {}) {
  return {
    accountId: account.id,
    provider: account.provider,
    workerId: 'worker-a',
    leaseToken: 'token-a',
    leasedAt: '2026-08-09T21:59:00.000Z',
    leaseExpiresAt: '2026-08-09T22:02:00.000Z',
    ...overrides,
  };
}

function createRpcClient(handler) {
  return { rpc: async (name, args) => handler(name, args) };
}

function runners(overrides = {}) {
  const success = async () => ({ status: 'succeeded', mode: 'incremental', pages: 1, written: 1 });
  return { mail: success, calendar: success, contacts: success, ...overrides };
}

test('Supabase lease manager claims an exact account/provider/worker-scoped lease', async () => {
  const calls = [];
  const manager = createSupabaseAccountSyncLeaseManager({
    client: createRpcClient(async (name, args) => {
      calls.push([name, args]);
      return { data: [leaseRow()], error: null };
    }),
    workerId: 'worker-a',
    now,
  });

  const claimed = await manager.acquire(account);
  assert.equal(assertAccountSyncLease(claimed, account, { workerId: 'worker-a', now: now() }), true);
  assert.equal(calls[0][0], 'claim_account_sync_lease');
  assert.deepEqual(calls[0][1], {
    p_account_id: account.id,
    p_provider: 'google',
    p_worker_id: 'worker-a',
    p_lease_seconds: 120,
  });
});

test('busy account returns no lease and executes no sync resource', async () => {
  let providerCalls = 0;
  let releases = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => null,
      heartbeat: async () => { throw new Error('heartbeat should not run'); },
      release: async () => { releases += 1; },
    }),
    requireAccountLease: true,
    runners: runners({ mail: async () => { providerCalls += 1; return { status: 'succeeded' }; } }),
  });

  const result = await run({ accounts: [account], resources: ['mail'], now });
  assert.equal(providerCalls, 0);
  assert.equal(releases, 0);
  assert.equal(result.accounts[0].status, 'skipped');
  assert.equal(result.accounts[0].reason, 'sync_already_running');
});

test('leased account sync heartbeats before resources and releases refreshed ownership', async () => {
  const events = [];
  const originalLease = lease();
  const refreshedLease = lease({ leaseToken: 'token-b', leaseExpiresAt: '2026-08-09T22:03:00.000Z' });
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => { events.push('acquire'); return originalLease; },
      heartbeat: async (received) => { assert.equal(received, originalLease); events.push('heartbeat'); return refreshedLease; },
      release: async (received) => { assert.equal(received, refreshedLease); events.push('release'); return true; },
    }),
    requireAccountLease: true,
    runners: runners({
      mail: async ({ accountLease, heartbeatLease }) => {
        assert.equal(accountLease, refreshedLease);
        assert.equal(typeof heartbeatLease, 'function');
        events.push('mail');
        return { status: 'succeeded' };
      },
    }),
  });

  const result = await run({ accounts: [account], resources: ['mail'], now });
  assert.deepEqual(events, ['acquire', 'heartbeat', 'mail', 'release']);
  assert.equal(result.accounts[0].status, 'succeeded');
});

test('lease is released in finally when a resource fails', async () => {
  const events = [];
  const originalLease = lease();
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => originalLease,
      heartbeat: async () => originalLease,
      release: async () => { events.push('release'); return true; },
    }),
    requireAccountLease: true,
    runners: runners({ mail: async () => { throw Object.assign(new Error('provider secret'), { status: 503 }); } }),
  });

  const result = await run({ accounts: [account], resources: ['mail'], now });
  assert.deepEqual(events, ['release']);
  assert.equal(result.accounts[0].status, 'failed');
  assert.equal(JSON.stringify(result).includes('provider secret'), false);
});

test('lease backend diagnostics are sanitized and retryable', async () => {
  const manager = createSupabaseAccountSyncLeaseManager({
    client: createRpcClient(async () => ({ data: null, error: { code: 'XX000', message: 'database secret detail' } })),
    workerId: 'worker-a',
    now,
  });
  await assert.rejects(async () => manager.acquire(account), (error) => {
    assert.equal(error.code, 'SYNC_LEASE_BACKEND');
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes('database secret detail'), false);
    return true;
  });
});

test('lease scope drift and expiry fail closed', () => {
  const scopedLease = lease({ provider: 'microsoft' });
  assert.throws(() => assertAccountSyncLease(scopedLease, account, { workerId: 'worker-a', now: now() }), /scope mismatch/);
  assert.throws(() => assertAccountSyncLease({ ...scopedLease, provider: 'google', leaseExpiresAt: '2026-08-09T21:59:59.000Z' }, account, { workerId: 'worker-a', now: now() }), /expired/);
});

test('production scheduler cannot require leasing without a resolver', () => {
  assert.throws(() => createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    requireAccountLease: true,
    runners: runners(),
  }), /requires resolveLeaseManager/);
});

test('lease policy exposes bounded service-only ownership contract', () => {
  assert.deepEqual(getAccountSyncLeasePolicy(), {
    defaultLeaseDurationMs: 120000,
    minLeaseDurationMs: 5000,
    maxLeaseDurationMs: 900000,
    ownership: 'account_provider_worker_token',
    browserAuthority: 'none',
  });
});

test('heartbeat rotates the lease token and extends the exact owned lease', async () => {
  const calls = [];
  const manager = createSupabaseAccountSyncLeaseManager({
    client: createRpcClient(async (name, args) => {
      calls.push([name, args]);
      if (name === 'claim_account_sync_lease') return { data: [leaseRow()], error: null };
      if (name === 'heartbeat_account_sync_lease') {
        return { data: [leaseRow({ lease_token: '33333333-3333-3333-3333-333333333333', lease_expires_at: '2026-08-09T22:04:00.000Z' })], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    }),
    workerId: 'worker-a',
    now,
  });

  const claimed = await manager.acquire(account);
  const refreshed = await manager.heartbeat(claimed, account);
  assert.equal(calls[1][0], 'heartbeat_account_sync_lease');
  assert.equal(calls[1][1].p_lease_token, claimed.leaseToken);
  assert.equal(refreshed.leaseToken, '33333333-3333-3333-3333-333333333333');
  assert.notEqual(refreshed.leaseToken, claimed.leaseToken);
});

test('lost heartbeat ownership becomes a sanitized retryable sync-control failure', async () => {
  const manager = createSupabaseAccountSyncLeaseManager({
    client: createRpcClient(async (name) => {
      if (name === 'claim_account_sync_lease') return { data: [leaseRow()], error: null };
      if (name === 'heartbeat_account_sync_lease') return { data: [], error: null };
      throw new Error(`unexpected rpc ${name}`);
    }),
    workerId: 'worker-a',
    now,
  });

  const claimed = await manager.acquire(account);
  await assert.rejects(async () => manager.heartbeat(claimed, account), (error) => {
    assert.equal(error.code, 'SYNC_LEASE_LOST');
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterMs, 5000);
    return true;
  });
});

test('mail page checkpoint refuses persistence when post-fetch lease heartbeat fails', async () => {
  let cursorSaves = 0;
  const syncRecords = [];
  const store = {
    getCursor: async () => null,
    saveCursor: async () => { cursorSaves += 1; },
    recordSync: async (_accountId, record) => { syncRecords.push(record); },
  };
  const adapter = {
    fetchMailPage: async () => ({ items: [], nextCursor: null, checkpoint: 'history-2' }),
    normalizeMessage: () => { throw new Error('no messages expected'); },
  };
  const heartbeatFailure = Object.assign(new Error('hidden lease backend detail'), {
    code: 'SYNC_LEASE_BACKEND',
    retryable: true,
    retryAfterMs: 5000,
  });

  await assert.rejects(() => runIncrementalMailSync({
    account,
    adapter,
    store,
    now,
    heartbeatLease: async () => { throw heartbeatFailure; },
  }), heartbeatFailure);

  assert.equal(cursorSaves, 0);
  assert.equal(syncRecords.length, 1);
  assert.equal(syncRecords[0].status, 'failed');
  assert.equal(syncRecords[0].reason, 'sync_control_transient');
  assert.equal(syncRecords[0].retryable, true);
});

test('lease loss blocks remaining resources for only the affected account', async () => {
  const originalLease = lease();
  const refreshedLease = lease({ leaseToken: 'token-b', leaseExpiresAt: '2026-08-09T22:03:00.000Z' });
  let heartbeats = 0;
  let calendarCalls = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => originalLease,
      heartbeat: async () => {
        heartbeats += 1;
        if (heartbeats === 1) return refreshedLease;
        throw Object.assign(new Error('lost'), { code: 'SYNC_LEASE_LOST', retryable: true, retryAfterMs: 5000 });
      },
      release: async () => true,
    }),
    requireAccountLease: true,
    runners: runners({
      mail: async ({ heartbeatLease }) => { await heartbeatLease(); return { status: 'succeeded' }; },
      calendar: async () => { calendarCalls += 1; return { status: 'succeeded' }; },
    }),
  });

  const result = await run({ accounts: [account], resources: ['mail', 'calendar'], now });
  assert.equal(calendarCalls, 0);
  assert.equal(result.accounts[0].resources[0].resource, 'mail');
  assert.equal(result.accounts[0].resources[0].reason, 'sync_control_transient');
  assert.equal(result.accounts[0].resources[1].resource, 'calendar');
  assert.equal(result.accounts[0].resources[1].reason, 'sync_lease_unavailable');
});

test('lease manager without heartbeat fails before resource execution', async () => {
  let resourceCalls = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({ acquire: async () => lease(), release: async () => true }),
    requireAccountLease: true,
    runners: runners({ mail: async () => { resourceCalls += 1; return { status: 'succeeded' }; } }),
  });

  const result = await run({ accounts: [account], resources: ['mail'], now });
  assert.equal(resourceCalls, 0);
  assert.equal(result.accounts[0].reason, 'lease_acquisition_failed');
});
