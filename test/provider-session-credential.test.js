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

test('contained provider session exposes no ambient token property', () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  assert.deepEqual(Object.keys(session), ['provider', 'accountId', 'credentialMode']);
  assert.equal('accessToken' in session, false);
  assert.equal(session.accessToken, undefined);
  assert.equal({ ...session }.accessToken, undefined);
  assert.equal(JSON.stringify(session).includes('secret-token'), false);
});

test('contained provider session serializes only safe capability metadata', () => {
  const session = createContainedProviderSession({ provider: 'microsoft', accountId: 'account-2', accessToken: 'bearer-secret' });
  assert.deepEqual(JSON.parse(JSON.stringify(session)), {
    provider: 'microsoft',
    accountId: 'account-2',
    credential: 'ephemeral',
    credentialMode: 'capability-only',
  });
});

test('withAccessToken permits provider work while preventing direct credential return', async () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  const result = await session.withAccessToken(async (token) => ({ status: 200, authenticated: token === 'secret-token' }));
  assert.deepEqual(result, { status: 200, authenticated: true });
  await assert.rejects(
    () => session.withAccessToken(async (token) => token),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_ESCAPE_BLOCKED',
  );
  assert.equal(Object.prototype.propertyIsEnumerable.call(session, 'withAccessToken'), false);
});

test('credential escape detection rejects nested, map, set, and thrown secret material', async () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  await assert.rejects(() => session.withAccessToken(async (token) => ({ nested: [`Bearer ${token}`] })), /attempted to return secret material/);
  await assert.rejects(() => session.withAccessToken(async (token) => new Map([['authorization', token]])), /attempted to return secret material/);
  await assert.rejects(() => session.withAccessToken(async (token) => new Set([`prefix-${token}-suffix`])), /attempted to return secret material/);
  await assert.rejects(
    () => session.withAccessToken(async (token) => { throw new Error(`provider failed with ${token}`); }),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_ESCAPE_BLOCKED' && !error.message.includes('secret-token'),
  );
});

test('ordinary provider callback failures preserve non-secret errors', async () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  const expected = new Error('provider timed out');
  await assert.rejects(() => session.withAccessToken(async () => { throw expected; }), (error) => error === expected);
});

test('contained provider sessions are immutable and binding assertions fail closed', () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  assert.equal(Object.isFrozen(session), true);
  assert.equal(assertContainedProviderSession(session, { provider: 'google', accountId: 'account-1' }), session);
  assert.throws(() => assertContainedProviderSession(session, { provider: 'microsoft', accountId: 'account-1' }), /provider mismatch/);
  assert.throws(() => assertContainedProviderSession(session, { provider: 'google', accountId: 'other-account' }), /account mismatch/);
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'legacy', withAccessToken() {} }),
    /Capability-only provider credential mode is required/,
  );
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'capability-only', accessToken: 'ambient', withAccessToken() {} }),
    /Ambient provider token access is forbidden/,
  );
});

test('reconciliation session preparation does not leak or expose access tokens through prepared context', async () => {
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
    credentialMode: 'capability-only',
  });
  assert.equal('accessToken' in prepared.providerSession, false);
  assert.equal(assertContainedProviderSession(prepared.providerSession, { provider: 'google', accountId: 'account-1' }), prepared.providerSession);
});

test('invalid credentials and missing capability callbacks are rejected', async () => {
  assert.throws(() => createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: '' }), /Provider access token is required/);
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
  await assert.rejects(() => session.withAccessToken(null), /Provider token callback is required/);
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'capability-only' }),
    /credential capability is required/,
  );
});
