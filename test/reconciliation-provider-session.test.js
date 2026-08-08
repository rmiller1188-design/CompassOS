import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReconciliationProviderSessionError,
  classifyReconciliationProviderSessionError,
  createOAuthReconciliationSessionPreparer,
} from '../src/actions/reconciliation-provider-session.js';
import { runReconciliationRetryWorkerOnce } from '../src/actions/reconciliation-retry-worker.js';

function context(overrides = {}) {
  const reconciliation = {
    actionId: 'action-1',
    userId: 'user-1',
    accountId: 'account-1',
    provider: 'google',
    status: 'pending',
    ...overrides.reconciliation,
  };
  const account = {
    id: 'account-1',
    userId: 'user-1',
    provider: 'google',
    status: 'connected',
    ...overrides.account,
  };
  return { reconciliation, account, action: { id: 'action-1' }, ...overrides, reconciliation, account };
}

function retryStore({ attempt = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async claim() { return { action_id: 'action-1', lease_token: 'lease-1', attempt_count: attempt }; },
    async scheduleRetry(input) { calls.push(['scheduleRetry', input]); return input; },
    async release(input) { calls.push(['release', input]); return input; },
    async exhaust(input) { calls.push(['exhaust', input]); return input; },
  };
}

test('OAuth reconciliation session preparer acquires a valid account-bound access token', async () => {
  const calls = [];
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: {
      async getValidAccessToken(input) {
        calls.push(input);
        return 'access-secret';
      },
    },
  });
  const prepared = await prepare(context());
  assert.deepEqual(calls, [{ userId: 'user-1', accountId: 'account-1' }]);
  assert.equal(prepared.providerSession.provider, 'google');
  assert.equal(prepared.providerSession.accountId, 'account-1');
  assert.equal(prepared.providerSession.accessToken, 'access-secret');
});

test('session preparation fails closed on account or owner drift before OAuth access', async () => {
  let called = false;
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: { async getValidAccessToken() { called = true; return 'secret'; } },
  });
  await assert.rejects(() => prepare(context({ account: { id: 'other-account' } })), /does not match reconciliation case/);
  await assert.rejects(() => prepare(context({ account: { userId: 'other-user' } })), /owner does not match/);
  assert.equal(called, false);
});

test('disconnected and reauthorization-required accounts never attempt provider lookup', async () => {
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: { async getValidAccessToken() { throw new Error('must not run'); } },
  });
  for (const status of ['disconnected', 'reauthorization_required']) {
    await assert.rejects(
      () => prepare(context({ account: { status } })),
      (error) => error instanceof ReconciliationProviderSessionError && error.code === 'PROVIDER_RECONNECT_REQUIRED',
    );
  }
});

test('transient OAuth refresh failure is classified for bounded retry without provider lookup', async () => {
  const store = retryStore();
  let orchestrated = false;
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: {
      async getValidAccessToken() {
        const error = new Error('rate limited');
        error.status = 429;
        error.retryable = true;
        error.retryAfterMs = 30_000;
        throw error;
      },
    },
  });
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-1',
    retryStore: store,
    hydrate: async () => context(),
    prepareProviderSession: prepare,
    orchestrate: async () => { orchestrated = true; return { disposition: 'resolved_succeeded' }; },
    now: () => new Date('2026-08-08T16:00:00.000Z'),
    retryPolicy: { baseDelayMs: 1_000, maxDelayMs: 60_000 },
  });
  assert.equal(result.disposition, 'retry_scheduled');
  assert.equal(result.resolutionCode, 'PROVIDER_SESSION_REFRESH_TRANSIENT');
  assert.equal(result.retry.providerDelayMs, 30_000);
  assert.equal(orchestrated, false);
  assert.equal(store.calls[0][0], 'scheduleRetry');
  assert.equal(store.calls[0][1].errorCode, 'PROVIDER_SESSION_REFRESH_TRANSIENT');
});

test('permanent OAuth failure routes directly to reconnect/manual review', async () => {
  const store = retryStore();
  let orchestrated = false;
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: {
      async getValidAccessToken() {
        const error = new Error('invalid_grant');
        error.status = 400;
        error.code = 'invalid_grant';
        throw error;
      },
    },
  });
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-1',
    retryStore: store,
    hydrate: async () => context(),
    prepareProviderSession: prepare,
    orchestrate: async () => { orchestrated = true; },
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'PROVIDER_RECONNECT_REQUIRED');
  assert.equal(orchestrated, false);
  assert.deepEqual(store.calls[0], ['exhaust', { actionId: 'action-1', leaseToken: 'lease-1', resolutionCode: 'PROVIDER_RECONNECT_REQUIRED' }]);
});

test('refreshed OAuth session is ephemeral to orchestration and not returned by the worker', async () => {
  const store = retryStore();
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: { async getValidAccessToken() { return 'rotated-access-secret'; } },
  });
  let observedToken = null;
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-1',
    retryStore: store,
    hydrate: async () => context(),
    prepareProviderSession: prepare,
    orchestrate: async (prepared) => {
      observedToken = prepared.providerSession.accessToken;
      return { disposition: 'resolved_succeeded', resolutionCode: 'PROVIDER_CONFIRMED_SUCCESS' };
    },
  });
  assert.equal(observedToken, 'rotated-access-secret');
  assert.equal(result.disposition, 'resolved_succeeded');
  assert.equal(JSON.stringify(result).includes('rotated-access-secret'), false);
  assert.equal(store.calls[0][0], 'release');
});

test('transient OAuth refresh at the attempt ceiling exhausts without manufacturing absence evidence', async () => {
  const store = retryStore({ attempt: 8 });
  const prepare = async () => {
    throw new ReconciliationProviderSessionError('temporary', { code: 'PROVIDER_SESSION_REFRESH_TRANSIENT', retryable: true });
  };
  const result = await runReconciliationRetryWorkerOnce({
    workerId: 'worker-1',
    retryStore: store,
    hydrate: async () => context(),
    prepareProviderSession: prepare,
    orchestrate: async () => { throw new Error('must not run'); },
    maxAttempts: 8,
  });
  assert.equal(result.disposition, 'manual_review');
  assert.equal(result.resolutionCode, 'PROVIDER_LOOKUP_RETRY_EXHAUSTED');
  assert.equal(store.calls[0][0], 'exhaust');
});

test('provider session classifier keeps transient and reconnect paths distinct', () => {
  assert.deepEqual(
    classifyReconciliationProviderSessionError(new ReconciliationProviderSessionError('retry', { code: 'PROVIDER_SESSION_REFRESH_TRANSIENT', retryable: true, retryAfterMs: 1000 })),
    { disposition: 'retry_later', resolutionCode: 'PROVIDER_SESSION_REFRESH_TRANSIENT', retryAfterMs: 1000 },
  );
  assert.deepEqual(
    classifyReconciliationProviderSessionError(new ReconciliationProviderSessionError('reconnect', { code: 'PROVIDER_RECONNECT_REQUIRED' })),
    { disposition: 'manual_review', resolutionCode: 'PROVIDER_RECONNECT_REQUIRED', retryAfterMs: null },
  );
});
