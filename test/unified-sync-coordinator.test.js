import test from 'node:test';
import assert from 'node:assert/strict';

import { createUnifiedSyncCoordinator, getUnifiedSyncCoordinatorPolicy } from '../src/sync/unified-sync-coordinator.js';

function runners(overrides = {}) {
  const success = (resource) => async () => ({ status: 'succeeded', mode: 'incremental', pages: 1, written: resource === 'mail' ? 2 : 1 });
  return {
    mail: success('mail'),
    calendar: success('calendar'),
    contacts: success('contacts'),
    ...overrides,
  };
}

const accounts = [
  { id: 'google-primary', provider: 'google', status: 'active' },
  { id: 'microsoft-work', provider: 'microsoft', status: 'active' },
];

const store = {};

test('unified coordinator syncs supported resources across multiple Google and Microsoft accounts', async () => {
  const resolved = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => { resolved.push(account.id); return { provider: account.provider }; },
    runners: runners(),
  });
  const result = await run({ accounts, store });

  assert.deepEqual(resolved, ['google-primary', 'microsoft-work']);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.summary, { total: 2, succeeded: 2, failed: 0, skipped: 0 });
  assert.deepEqual(result.accounts[0].resources.map((item) => item.resource), ['mail', 'calendar', 'contacts']);
  assert.deepEqual(result.accounts[1].resources.map((item) => item.resource), ['mail', 'calendar', 'contacts']);
});

test('one account failure is isolated and does not prevent another connected account from syncing', async () => {
  const seen = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => ({ accountId: account.id }),
    runners: runners({
      mail: async ({ account }) => {
        seen.push(account.id);
        if (account.id === 'google-primary') throw Object.assign(new Error('provider detail that must not escape'), { status: 503, retryAfterMs: 2500 });
        return { status: 'succeeded', mode: 'incremental', pages: 1, written: 3 };
      },
    }),
  });

  const result = await run({ accounts, store, resources: ['mail'] });
  assert.deepEqual(seen, ['google-primary', 'microsoft-work']);
  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.summary, { total: 2, succeeded: 1, failed: 1, skipped: 0 });
  assert.deepEqual(result.accounts[0].resources[0], {
    resource: 'mail', status: 'failed', retryable: true, reason: 'provider_transient', retryAfterMs: 2500,
  });
  assert.equal(JSON.stringify(result).includes('provider detail'), false);
});

test('reauthorization failure blocks remaining resources only for the affected account', async () => {
  const calls = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => ({ accountId: account.id }),
    runners: runners({
      mail: async ({ account }) => {
        calls.push(`${account.id}:mail`);
        if (account.id === 'google-primary') throw Object.assign(new Error('expired'), { status: 401 });
        return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 };
      },
      calendar: async ({ account }) => { calls.push(`${account.id}:calendar`); return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 }; },
      contacts: async ({ account }) => { calls.push(`${account.id}:contacts`); return { status: 'succeeded', mode: 'incremental', pages: 1, written: 1 }; },
    }),
  });

  const result = await run({ accounts, store });
  assert.deepEqual(calls, [
    'google-primary:mail',
    'microsoft-work:mail', 'microsoft-work:calendar', 'microsoft-work:contacts',
  ]);
  assert.equal(result.accounts[0].requiresReauthorization, true);
  assert.equal(result.accounts[0].resources[1].status, 'skipped');
  assert.equal(result.accounts[0].resources[2].status, 'skipped');
  assert.equal(result.accounts[1].status, 'succeeded');
});

test('inactive accounts are skipped before adapter resolution', async () => {
  let resolutions = 0;
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => { resolutions += 1; return {}; },
    runners: runners(),
  });
  const result = await run({ accounts: [{ id: 'disabled', provider: 'google', status: 'reauthorization_required' }], store });
  assert.equal(resolutions, 0);
  assert.deepEqual(result.summary, { total: 1, succeeded: 0, failed: 0, skipped: 1 });
  assert.equal(result.accounts[0].reason, 'account_inactive');
});

test('adapter resolution failure is sanitized and isolated', async () => {
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async (account) => {
      if (account.id === 'google-primary') throw Object.assign(new Error('secret adapter diagnostic'), { code: 'ETIMEDOUT' });
      return {};
    },
    runners: runners(),
  });
  const result = await run({ accounts, store, resources: ['mail'] });
  assert.equal(result.accounts[0].reason, 'adapter_resolution_failed');
  assert.equal(result.accounts[0].resources[0].retryable, true);
  assert.equal(JSON.stringify(result).includes('secret adapter diagnostic'), false);
  assert.equal(result.accounts[1].status, 'succeeded');
});

test('resource selection is de-duplicated and unsupported resources fail closed', async () => {
  const calls = [];
  const run = createUnifiedSyncCoordinator({
    resolveAdapter: async () => ({}),
    runners: runners({ mail: async () => { calls.push('mail'); return { status: 'succeeded' }; } }),
  });
  await run({ accounts: [accounts[0]], store, resources: ['mail', 'mail'] });
  assert.deepEqual(calls, ['mail']);
  await assert.rejects(() => run({ accounts: [accounts[0]], store, resources: ['messages'] }), /Unsupported sync resource/);
});

test('duplicate account ids and unsupported providers fail closed before any provider work', async () => {
  let resolutions = 0;
  const run = createUnifiedSyncCoordinator({ resolveAdapter: async () => { resolutions += 1; return {}; }, runners: runners() });
  await assert.rejects(() => run({ accounts: [accounts[0], { ...accounts[0] }], store }), /Duplicate connected-account id/);
  await assert.rejects(() => run({ accounts: [{ id: 'x', provider: 'imap', status: 'active' }], store }), /Unsupported connected-account provider/);
  assert.equal(resolutions, 0);
});

test('coordinator policy exposes only supported production providers and resources', () => {
  assert.deepEqual(getUnifiedSyncCoordinatorPolicy(), {
    supportedProviders: ['google', 'microsoft'],
    supportedResources: ['mail', 'calendar', 'contacts'],
  });
});
