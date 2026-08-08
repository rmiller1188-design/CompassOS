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

function session(overrides = {}) {
  return createContainedProviderSession({
    provider: 'google',
    accountId: 'account-1',
    accessToken: 'secret-token',
    ...overrides,
  });
}

test('contained provider session exposes no ambient token property', () => {
  const value = session();
  assert.deepEqual(Object.keys(value), ['provider', 'accountId', 'credentialMode', 'capabilityUseMode']);
  assert.equal('accessToken' in value, false);
  assert.equal(value.accessToken, undefined);
  assert.equal({ ...value }.accessToken, undefined);
  assert.equal(JSON.stringify(value).includes('secret-token'), false);
});

test('contained provider session serializes only safe capability metadata', () => {
  const value = createContainedProviderSession({ provider: 'microsoft', accountId: 'account-2', accessToken: 'bearer-secret' });
  assert.deepEqual(JSON.parse(JSON.stringify(value)), {
    provider: 'microsoft',
    accountId: 'account-2',
    credential: 'ephemeral',
    credentialMode: 'capability-only',
    capabilityUseMode: 'single-use',
  });
});

test('withAccessToken permits exactly one provider operation', async () => {
  const value = session();
  const result = await value.withAccessToken(async (token) => ({ status: 200, authenticated: token === 'secret-token' }));
  assert.deepEqual(result, { status: 200, authenticated: true });
  await assert.rejects(
    () => value.withAccessToken(async () => ({ status: 200 })),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED',
  );
  assert.equal(Object.prototype.propertyIsEnumerable.call(value, 'withAccessToken'), false);
});

test('concurrent credential capability attempts cannot reuse the token', async () => {
  const value = session();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = value.withAccessToken(async () => {
    await gate;
    return { ok: true };
  });
  await assert.rejects(
    () => value.withAccessToken(async () => ({ ok: true })),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED',
  );
  release();
  assert.deepEqual(await first, { ok: true });
});

test('credential capability expires before provider code can execute', async () => {
  let current = 1_000;
  const value = session({ capabilityTtlMs: 500, now: () => current });
  current = 1_500;
  let called = false;
  await assert.rejects(
    () => value.withAccessToken(async () => { called = true; return { ok: true }; }),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_EXPIRED',
  );
  assert.equal(called, false);
  await assert.rejects(
    () => value.withAccessToken(async () => ({ ok: true })),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED',
  );
});

test('callback failure still consumes the credential capability', async () => {
  const value = session();
  const expected = new Error('provider timed out');
  await assert.rejects(() => value.withAccessToken(async () => { throw expected; }), (error) => error === expected);
  await assert.rejects(
    () => value.withAccessToken(async () => ({ ok: true })),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED',
  );
});

test('credential escape detection rejects nested, map, set, and thrown secret material', async () => {
  await assert.rejects(() => session().withAccessToken(async (token) => ({ nested: [`Bearer ${token}`] })), /attempted to return secret material/);
  await assert.rejects(() => session().withAccessToken(async (token) => new Map([['authorization', token]])), /attempted to return secret material/);
  await assert.rejects(() => session().withAccessToken(async (token) => new Set([`prefix-${token}-suffix`])), /attempted to return secret material/);
  await assert.rejects(
    () => session().withAccessToken(async (token) => { throw new Error(`provider failed with ${token}`); }),
    (error) => error?.code === 'PROVIDER_CREDENTIAL_ESCAPE_BLOCKED' && !error.message.includes('secret-token'),
  );
});

test('ordinary provider callback failures preserve non-secret errors', async () => {
  const value = session();
  const expected = new Error('provider timed out');
  await assert.rejects(() => value.withAccessToken(async () => { throw expected; }), (error) => error === expected);
});

test('contained provider sessions are immutable and binding assertions fail closed', () => {
  const value = session();
  assert.equal(Object.isFrozen(value), true);
  assert.equal(assertContainedProviderSession(value, { provider: 'google', accountId: 'account-1' }), value);
  assert.throws(() => assertContainedProviderSession(value, { provider: 'microsoft', accountId: 'account-1' }), /provider mismatch/);
  assert.throws(() => assertContainedProviderSession(value, { provider: 'google', accountId: 'other-account' }), /account mismatch/);
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'legacy', capabilityUseMode: 'single-use', withAccessToken() {} }),
    /Capability-only provider credential mode is required/,
  );
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'capability-only', capabilityUseMode: 'reusable', withAccessToken() {} }),
    /Single-use provider credential capability is required/,
  );
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'capability-only', capabilityUseMode: 'single-use', accessToken: 'ambient', withAccessToken() {} }),
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
    capabilityUseMode: 'single-use',
  });
  assert.equal('accessToken' in prepared.providerSession, false);
  assert.equal(assertContainedProviderSession(prepared.providerSession, { provider: 'google', accountId: 'account-1' }), prepared.providerSession);
});

test('invalid credentials, TTLs, clocks, and missing capability callbacks are rejected', async () => {
  assert.throws(() => createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: '' }), /Provider access token is required/);
  assert.throws(() => session({ capabilityTtlMs: 0 }), /TTL must be a positive number/);
  assert.throws(() => session({ now: null }), /clock is required/);
  assert.throws(() => session({ now: () => Number.NaN }), /finite timestamp/);
  const value = session();
  await assert.rejects(() => value.withAccessToken(null), /Provider token callback is required/);
  assert.throws(
    () => assertContainedProviderSession({ provider: 'google', accountId: 'account-1', credentialMode: 'capability-only', capabilityUseMode: 'single-use' }),
    /credential capability is required/,
  );
});
