import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAccountSyncLease,
  createSupabaseAccountSyncLeaseManager,
  getAccountSyncLeasePolicy,
} from '../src/sync/account-sync-lease.js';
import { createUnifiedSyncCoordinator } from '../src/sync/unified-sync-coordinator.js';

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

  const lease = await manager.acquire(account);
  assert.equal(assertAccountSyncLease(lease, account, { workerId: 'worker-a', now: now() }), true);
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

test('leased account sync releases ownership after successful resources', async () => {
  const events = [];
  const lease = {
    accountId: account.id,
    provider: account.provider,
    workerId: 'worker-a',
    leaseToken: 'token-a',
    leasedAt: '2026-08-09T21:59:00.000Z',
    leaseExpiresAt: '2026-08-09T22:02:00.000Z',
  };
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => { events.push('acquire'); return lease; },
      release: async (received) => { assert.equal(received, lease); events.push('release'); return true; },
    }),
    requireAccountLease: true,
    runners: runners({ mail: async ({ accountLease }) => { assert.equal(accountLease, lease); events.push('mail'); return { status: 'succeeded' }; } }),
  });

  const result = await run({ accounts: [account], resources: ['mail'], now });
  assert.deepEqual(events, ['acquire', 'mail', 'release']);
  assert.equal(result.accounts[0].status, 'succeeded');
});

test('lease is released in finally when a resource fails', async () => {
  const events = [];
  const lease = {
    accountId: account.id,
    provider: account.provider,
    workerId: 'worker-a',
    leaseToken: 'token-a',
    leasedAt: '2026-08-09T21:59:00.000Z',
    leaseExpiresAt: '2026-08-09T22:02:00.000Z',
  };
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    resolveLeaseManager: async () => ({
      acquire: async () => lease,
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
  const lease = {
    accountId: account.id,
    provider: 'microsoft',
    workerId: 'worker-a',
    leaseToken: 'token-a',
    leaseExpiresAt: '2026-08-09T22:02:00.000Z',
  };
  assert.throws(() => assertAccountSyncLease(lease, account, { workerId: 'worker-a', now: now() }), /scope mismatch/);
  assert.throws(() => assertAccountSyncLease({ ...lease, provider: 'google', leaseExpiresAt: '2026-08-09T21:59:59.000Z' }, account, { workerId: 'worker-a', now: now() }), /expired/);
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
