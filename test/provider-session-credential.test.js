import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainedProviderSession, assertContainedProviderSession } from '../src/actions/provider-session-credential.js';
import { createOAuthReconciliationSessionPreparer } from '../src/actions/reconciliation-provider-session.js';

function buildContext() {
  return {
    reconciliation: {
      actionId: 'action-1',
      userId: 'user-1',
      accountId: 'account-1',
      provider: 'google',
      status: 'pending',
    },
    account: {
      id: 'account-1',
      userId: 'user-1',
      provider: 'google',
      status: 'connected',
    },
  };
}

test('contained provider session keeps the raw token non-enumerable', () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  assert.deepEqual(Object.keys(session), ['provider', 'accountId']);
  assert.equal(session.accessToken, 'secret-token');
  assert.equal({ ...session }.accessToken, undefined);
  assert.equal(JSON.stringify(session).includes('secret-token'), false);
});

test('contained provider session serializes only safe metadata', () => {
  const session = createContainedProviderSession({ provider: 'microsoft', accountId: 'account-2', accessToken: 'bearer-secret' });
  assert.deepEqual(JSON.parse(JSON.stringify(session)), {
    provider: 'microsoft',
    accountId: 'account-2',
    credential: 'ephemeral',
  });
});

test('withAccessToken exposes the credential only inside an explicit capability callback', async () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  const result = await session.withAccessToken(async (token) => `Bearer ${token}`);
  assert.equal(result, 'Bearer secret-token');
  assert.equal(Object.prototype.propertyIsEnumerable.call(session, 'withAccessToken'), false);
});

test('contained provider sessions are immutable and binding assertions fail closed', () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  assert.equal(Object.isFrozen(session), true);
  assert.equal(assertContainedProviderSession(session, { provider: 'google', accountId: 'account-1' }), session);
  assert.throws(() => assertContainedProviderSession(session, { provider: 'microsoft', accountId: 'account-1' }), /provider mismatch/);
  assert.throws(() => assertContainedProviderSession(session, { provider: 'google', accountId: 'other-account' }), /account mismatch/);
});

test('reconciliation session preparation does not leak access tokens through context serialization', async () => {
  const prepare = createOAuthReconciliationSessionPreparer({
    oauthService: { async getValidAccessToken() { return 'rotated-secret-token'; } },
  });
  const prepared = await prepare(buildContext());
  const serialized = JSON.stringify(prepared);
  assert.equal(serialized.includes('rotated-secret-token'), false);
  assert.deepEqual(JSON.parse(serialized).providerSession, {
    provider: 'google',
    accountId: 'account-1',
    credential: 'ephemeral',
  });
  assert.equal(prepared.providerSession.accessToken, 'rotated-secret-token');
});

test('invalid credentials and missing capability callbacks are rejected', async () => {
  assert.throws(() => createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: '' }), /Provider access token is required/);
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  await assert.rejects(() => session.withAccessToken(null), /Provider token callback is required/);
  assert.throws(() => assertContainedProviderSession({ provider: 'google', accountId: 'account-1' }), /credential capability is required/);
});
