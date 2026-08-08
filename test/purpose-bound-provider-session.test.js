import test from 'node:test';
import assert from 'node:assert/strict';
import { createContainedProviderSession } from '../src/actions/provider-session-credential.js';
import { createPurposeBoundProviderSession, assertPurposeBoundProviderSession } from '../src/actions/purpose-bound-provider-session.js';
import { createOAuthReconciliationSessionPreparer } from '../src/actions/reconciliation-provider-session.js';

function contained() {
  return createContainedProviderSession({ provider: 'google', accountId: 'account-1', accessToken: 'secret-token' });
}

test('purpose-bound session preserves provider/account capability while hiding purpose subject from serialization', async () => {
  const session = createPurposeBoundProviderSession({ session: contained(), purpose: 'reconciliation.lookup', subjectId: 'action-1' });
  assert.equal(session.purposeBindingMode, 'exact');
  assert.equal(session.purpose, 'reconciliation.lookup');
  assert.equal(session.subjectId, 'action-1');
  assert.equal(Object.keys(session).includes('subjectId'), false);
  assert.equal(JSON.stringify(session).includes('action-1'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), {
    provider: 'google',
    accountId: 'account-1',
    credential: 'ephemeral',
    credentialMode: 'capability-only',
    capabilityUseMode: 'single-use',
  });
  const result = await session.withAccessToken(async (token) => ({ ok: token === 'secret-token' }));
  assert.deepEqual(result, { ok: true });
  await assert.rejects(() => session.withAccessToken(async () => ({ ok: true })), (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED');
});

test('purpose binding assertions fail closed on purpose, subject, provider, or account drift', () => {
  const session = createPurposeBoundProviderSession({ session: contained(), purpose: 'reconciliation.lookup', subjectId: 'action-1' });
  assert.equal(assertPurposeBoundProviderSession(session, { purpose: 'reconciliation.lookup', subjectId: 'action-1', provider: 'google', accountId: 'account-1' }), session);
  assert.throws(() => assertPurposeBoundProviderSession(session, { purpose: 'mail.send', subjectId: 'action-1' }), (error) => error?.code === 'PROVIDER_CREDENTIAL_PURPOSE_MISMATCH');
  assert.throws(() => assertPurposeBoundProviderSession(session, { purpose: 'reconciliation.lookup', subjectId: 'action-2' }), (error) => error?.code === 'PROVIDER_CREDENTIAL_PURPOSE_MISMATCH');
  assert.throws(() => assertPurposeBoundProviderSession(session, { provider: 'microsoft' }), /provider mismatch/);
  assert.throws(() => assertPurposeBoundProviderSession(session, { accountId: 'account-2' }), /account mismatch/);
});

test('reconciliation OAuth preparer mints exact purpose/action bound provider sessions', async () => {
  const prepare = createOAuthReconciliationSessionPreparer({ oauthService: { async getValidAccessToken() { return 'rotated-secret'; } } });
  const prepared = await prepare({
    reconciliation: { actionId: 'action-77', userId: 'user-1', accountId: 'account-1', provider: 'google', status: 'pending' },
    account: { id: 'account-1', userId: 'user-1', provider: 'google', status: 'connected' },
  });
  assertPurposeBoundProviderSession(prepared.providerSession, {
    purpose: 'reconciliation.lookup',
    subjectId: 'action-77',
    provider: 'google',
    accountId: 'account-1',
  });
  assert.equal(JSON.stringify(prepared).includes('action-77'), true);
  assert.equal(JSON.stringify(prepared.providerSession).includes('action-77'), false);
  assert.equal(JSON.stringify(prepared).includes('rotated-secret'), false);
});

test('invalid purpose-bound wrappers are rejected before credential use', () => {
  assert.throws(() => createPurposeBoundProviderSession({ session: contained(), purpose: '', subjectId: 'action-1' }), /purpose is required/);
  assert.throws(() => createPurposeBoundProviderSession({ session: contained(), purpose: 'reconciliation.lookup', subjectId: '' }), /subject id is required/);
  assert.throws(() => assertPurposeBoundProviderSession(contained(), { purpose: 'reconciliation.lookup', subjectId: 'action-1' }), /Exact provider credential purpose binding is required/);
});
