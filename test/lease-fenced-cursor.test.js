import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseMailSyncStore } from '../src/sync/supabase-store.js';
import { runIncrementalMailSync } from '../src/sync/mail-incremental.js';
import { runIncrementalCalendarSync } from '../src/sync/calendar-incremental.js';
import { runIncrementalContactsSync } from '../src/sync/contacts-incremental.js';

const account = Object.freeze({ id: '11111111-1111-4111-8111-111111111111', provider: 'google' });
const lease = Object.freeze({
  accountId: account.id,
  provider: account.provider,
  workerId: 'worker-a',
  leaseToken: '22222222-2222-4222-8222-222222222222',
  leaseExpiresAt: '2026-08-10T18:00:00.000Z',
});

function forbiddenFrom() {
  throw new Error('direct cursor table write must not execute');
}

test('Supabase cursor save uses the lease-fenced RPC when a lease is supplied', async () => {
  const calls = [];
  const client = {
    from: forbiddenFrom,
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
  const store = createSupabaseMailSyncStore({ client, userId: 'user-a', account });
  await store.saveCursor(account.id, 'calendar', 'cursor-1', '2026-08-10T17:00:00.000Z', lease);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'save_sync_cursor_with_account_lease');
  assert.deepEqual(calls[0].args, {
    p_account_id: account.id,
    p_provider: 'google',
    p_worker_id: 'worker-a',
    p_lease_token: lease.leaseToken,
    p_resource: 'google_calendar_sync',
    p_cursor: 'cursor-1',
    p_watermark: '2026-08-10T17:00:00.000Z',
  });
});

test('lease-fenced cursor save fails retryably when ownership is no longer current', async () => {
  const client = {
    from: forbiddenFrom,
    async rpc() { return { data: false, error: null }; },
  };
  const store = createSupabaseMailSyncStore({ client, userId: 'user-a', account });
  await assert.rejects(
    () => store.saveCursor(account.id, 'mail', 'history-1', '2026-08-10T17:00:00.000Z', lease),
    (error) => error.code === 'SYNC_CURSOR_FENCE_LOST' && error.retryable === true && error.retryAfterMs === 5000,
  );
});

test('lease-fenced cursor backend errors are sanitized', async () => {
  const client = {
    from: forbiddenFrom,
    async rpc() { return { data: null, error: { message: 'postgres secret diagnostics', code: 'XX000' } }; },
  };
  const store = createSupabaseMailSyncStore({ client, userId: 'user-a', account });
  await assert.rejects(
    () => store.saveCursor(account.id, 'contacts', 'people-1', '2026-08-10T17:00:00.000Z', lease),
    (error) => error.code === 'SYNC_CURSOR_FENCE_BACKEND' && !error.message.includes('postgres secret diagnostics'),
  );
});

test('cursor fencing rejects account or provider drift before RPC execution', async () => {
  let rpcCalls = 0;
  const client = {
    from: forbiddenFrom,
    async rpc() { rpcCalls += 1; return { data: true, error: null }; },
  };
  const store = createSupabaseMailSyncStore({ client, userId: 'user-a', account });
  await assert.rejects(
    () => store.saveCursor(account.id, 'mail', 'history-1', '2026-08-10T17:00:00.000Z', { ...lease, provider: 'microsoft' }),
    (error) => error.code === 'SYNC_CURSOR_FENCE_INVALID',
  );
  assert.equal(rpcCalls, 0);
});

test('mail, calendar, and contacts runners pass the post-fetch lease to final cursor persistence', async () => {
  const cases = [
    { resource: 'mail', runner: runIncrementalMailSync, fetchName: 'fetchMailPage' },
    { resource: 'calendar', runner: runIncrementalCalendarSync, fetchName: 'fetchCalendarPage' },
    { resource: 'contacts', runner: runIncrementalContactsSync, fetchName: 'fetchContactsPage' },
  ];

  for (const item of cases) {
    const saved = [];
    const store = {
      async getCursor() { return null; },
      async saveCursor(...args) { saved.push(args); },
      async upsertMessages() {},
      async upsertEvents() {},
      async upsertContacts() {},
      async recordSync() {},
    };
    const adapter = {
      async [item.fetchName]() { return { items: [], nextCursor: null, checkpoint: `${item.resource}-cursor` }; },
    };
    let heartbeatCount = 0;
    const heartbeatLease = async () => {
      heartbeatCount += 1;
      return Object.freeze({ ...lease, leaseToken: `token-${heartbeatCount}` });
    };

    const result = await item.runner({ account, adapter, store, heartbeatLease, heartbeatIntervalMs: 1000 });
    assert.equal(result.status, 'succeeded');
    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], account.id);
    assert.equal(saved[0][1], item.resource);
    assert.equal(saved[0][2], `${item.resource}-cursor`);
    assert.equal(saved[0][4].accountId, account.id);
    assert.equal(saved[0][4].provider, account.provider);
    assert.match(saved[0][4].leaseToken, /^token-/);
  }
});
