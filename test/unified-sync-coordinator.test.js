import test from 'node:test';
import assert from 'node:assert/strict';

import { createUnifiedSyncCoordinator, getUnifiedSyncCoordinatorPolicy } from '../src/sync/unified-sync-coordinator.js';
import { bindSyncStoreToAccount, assertSyncStoreScope, getAccountBoundSyncStorePolicy } from '../src/sync/account-bound-store.js';

function runners(overrides = {}) {
  const success = (resource) => async () => ({ status: 'succeeded', mode: 'incremental', pages: 1, written: resource === 'mail' ? 2 : 1 });
  return { mail: success('mail'), calendar: success('calendar'), contacts: success('contacts'), ...overrides };
}

function resolveFreshStore() {
  return {};
}

const accounts = [
  { id: 'google-primary', provider: 'google', status: 'active' },
  { id: 'microsoft-work', provider: 'microsoft', status: 'active' },
];

test('unified coordinator syncs supported resources across multiple Google and Microsoft accounts with isolated stores', async () => {
  const resolvedAdapters = [];
  const resolvedStores = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => { resolvedAdapters.push(account.id); return { provider: account.provider }; },
    resolveStore: async (account) => { const value = {}; resolvedStores.push([account.id, value]); return value; },
    runners: runners(),
  });
  const result = await run({ accounts });
  assert.deepEqual(resolvedAdapters, ['google-primary', 'microsoft-work']);
  assert.equal(resolvedStores.length, 2);
  assert.notEqual(resolvedStores[0][1], resolvedStores[1][1]);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.summary, { total: 2, succeeded: 2, failed: 0, skipped: 0 });
  assert.deepEqual(result.accounts[0].resources.map((item) => item.resource), ['mail', 'calendar', 'contacts']);
});

test('runner receives a store bound to the exact connected account', async () => {
  const scopes = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => ({}),
    runners: runners({
      mail: async ({ account, store }) => {
        scopes.push(store.getAccountScope());
        assert.deepEqual(assertSyncStoreScope(store, account), { accountId: account.id, provider: account.provider });
        return { status: 'succeeded' };
      },
    }),
  });
  await run({ accounts, resources: ['mail'] });
  assert.deepEqual(scopes, [
    { accountId: 'google-primary', provider: 'google' },
    { accountId: 'microsoft-work', provider: 'microsoft' },
  ]);
});

test('account-bound store rejects cross-account method calls before the underlying store executes', async () => {
  let calls = 0;
  const raw = { getCursor: async () => { calls += 1; return null; } };
  const bound = bindSyncStoreToAccount({ store: raw, account: accounts[0] });
  await assert.rejects(() => bound.getCursor('microsoft-work', 'mail'), /account scope violation/);
  assert.equal(calls, 0);
  await bound.getCursor('google-primary', 'mail');
  assert.equal(calls, 1);
});

test('same raw store object cannot be reused across active connected accounts', async () => {
  const shared = {};
  const calls = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async () => shared,
    runners: runners({ mail: async ({ account }) => { calls.push(account.id); return { status: 'succeeded' }; } }),
  });
  const result = await run({ accounts, resources: ['mail'] });
  assert.deepEqual(calls, ['google-primary']);
  assert.equal(result.status, 'partial_failure');
  assert.equal(result.accounts[1].reason, 'store_resolution_failed');
  assert.equal(JSON.stringify(result).includes('cannot be reused'), false);
});

test('one account failure is isolated and does not prevent another connected account from syncing', async () => {
  const seen = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => ({ accountId: account.id }),
    resolveStore: async () => ({}),
    runners: runners({
      mail: async ({ account }) => {
        seen.push(account.id);
        if (account.id === 'google-primary') throw Object.assign(new Error('provider detail that must not escape'), { status: 503, retryAfterMs: 2500 });
        return { status: 'succeeded', mode: 'incremental', pages: 1, written: 3 };
      },
    }),
  });
  const result = await run({ accounts, resources: ['mail'] });
  assert.deepEqual(seen, ['google-primary', 'microsoft-work']);
  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.summary, { total: 2, succeeded: 1, failed: 1, skipped: 0 });
  assert.deepEqual(result.accounts[0].resources[0], { resource: 'mail', status: 'failed', retryable: true, reason: 'provider_transient', retryAfterMs: 2500 });
  assert.equal(JSON.stringify(result).includes('provider detail'), false);
});

test('reauthorization failure blocks remaining resources only for the affected account', async () => {
  const calls = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => ({ accountId: account.id }),
    resolveStore: async () => ({}),
    runners: runners({
      mail: async ({ account }) => { calls.push(`${account.id}:mail`); if (account.id === 'google-primary') throw Object.assign(new Error('expired'), { status: 401 }); return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 }; },
      calendar: async ({ account }) => { calls.push(`${account.id}:calendar`); return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 }; },
      contacts: async ({ account }) => { calls.push(`${account.id}:contacts`); return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 }; },
    }),
  });
  const result = await run({ accounts });
  assert.deepEqual(calls, ['google-primary:mail', 'microsoft-work:mail', 'microsoft-work:calendar', 'microsoft-work:contacts']);
  assert.equal(result.accounts[0].requiresReauthorization, true);
  assert.equal(result.accounts[0].resources[1].status, 'skipped');
  assert.equal(result.accounts[1].status, 'succeeded');
});

test('inactive accounts are skipped before adapter or store resolution', async () => {
  let adapters = 0;
  let stores = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => { adapters += 1; return {}; },
    resolveStore: async () => { stores += 1; return {}; },
    runners: runners(),
  });
  const result = await run({ accounts: [{ id: 'disabled', provider: 'google', status: 'reauthorization_required' }] });
  assert.equal(adapters, 0);
  assert.equal(stores, 0);
  assert.deepEqual(result.summary, { total: 1, succeeded: 0, failed: 0, skipped: 1 });
});

test('adapter resolution failure is sanitized and isolated', async () => {
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => { if (account.id === 'google-primary') throw Object.assign(new Error('secret adapter diagnostic'), { code: 'ETIMEDOUT' }); return {}; },
    resolveStore: async () => ({}),
    runners: runners(),
  });
  const result = await run({ accounts, resources: ['mail'] });
  assert.equal(result.accounts[0].reason, 'adapter_resolution_failed');
  assert.equal(result.accounts[0].resources[0].retryable, true);
  assert.equal(JSON.stringify(result).includes('secret adapter diagnostic'), false);
  assert.equal(result.accounts[1].status, 'succeeded');
});

test('store resolution failure is sanitized and isolated', async () => {
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    resolveStore: async (account) => { if (account.id === 'google-primary') throw Object.assign(new Error('database tenant diagnostic'), { code: 'ETIMEDOUT' }); return {}; },
    runners: runners(),
  });
  const result = await run({ accounts, resources: ['mail'] });
  assert.equal(result.accounts[0].reason, 'store_resolution_failed');
  assert.equal(result.accounts[0].resources[0].retryable, true);
  assert.equal(JSON.stringify(result).includes('database tenant diagnostic'), false);
  assert.equal(result.accounts[1].status, 'succeeded');
});

test('resource selection is de-duplicated and unsupported resources fail closed', async () => {
  const calls = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}), resolveStore: async () => ({}),
    runners: runners({ mail: async () => { calls.push('mail'); return { status: 'succeeded' }; } }),
  });
  await run({ accounts: [accounts[0]], resources: ['mail', 'mail'] });
  assert.deepEqual(calls, ['mail']);
  await assert.rejects(() => run({ accounts: [accounts[0]], resources: ['messages'] }), /Unsupported sync resource/);
});

test('duplicate account ids and unsupported providers fail closed before provider or store work', async () => {
  let adapters = 0;
  let stores = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => { adapters += 1; return {}; },
    resolveStore: async () => { stores += 1; return {}; },
    runners: runners(),
  });
  await assert.rejects(() => run({ accounts: [accounts[0], { ...accounts[0] }] }), /Duplicate connected-account id/);
  await assert.rejects(() => run({ accounts: [{ id: 'x', provider: 'imap', status: 'active' }] }), /Unsupported connected-account provider/);
  assert.equal(adapters, 0);
  assert.equal(stores, 0);
});

test('coordinator and account-bound store policies expose fail-closed production scope', () => {
  assert.deepEqual(getUnifiedSyncCoordinatorPolicy(), {
    supportedProviders: ['google', 'microsoft'],
    supportedResources: ['mail', 'calendar', 'contacts'],
    storeIsolation: 'per_account',
  });
  assert.deepEqual(getAccountBoundSyncStorePolicy(), {
    accountScopedMethods: ['getCursor', 'saveCursor', 'upsertMessages', 'upsertEvents', 'upsertContacts', 'recordSync', 'markReauthorizationRequired'],
    crossAccountCalls: 'deny',
  });
});
