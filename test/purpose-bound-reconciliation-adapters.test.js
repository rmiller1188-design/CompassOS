import test from 'node:test';
import assert from 'node:assert/strict';

import { createContainedProviderSession } from '../src/actions/provider-session-credential.js';
import { createPurposeBoundProviderSession } from '../src/actions/purpose-bound-provider-session.js';
import { createPurposeBoundProviderReconciliationLookup } from '../src/actions/purpose-bound-reconciliation-adapters.js';

function response({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return { ok, status, json: async () => json, headers: { get: (key) => headers[key.toLowerCase()] || null } };
}

function session({ provider = 'google', accountId = 'acct-1', actionId = 'act-1', purpose = 'reconciliation.lookup', token = 'provider-secret' } = {}) {
  return createPurposeBoundProviderSession({
    session: createContainedProviderSession({ provider, accountId, accessToken: token }),
    purpose,
    subjectId: actionId,
  });
}

function context({ provider = 'google', accountId = 'acct-1', actionId = 'act-1', actionType = 'mail.reply', providerSession = session({ provider, accountId, actionId }) } = {}) {
  return {
    account: { id: accountId, provider, status: 'active' },
    reconciliation: { actionId, actionType, idempotencyKeyHash: 'a'.repeat(64), status: 'pending' },
    action: actionType.startsWith('calendar.')
      ? { actionType, payload: { actionType, calendarId: 'primary' } }
      : { actionType },
    providerSession,
  };
}

test('purpose-bound Gmail reconciliation uses the capability token only inside the provider request', async () => {
  let request;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async (url, init) => {
      request = { url, init };
      return response({ json: { messages: [{ id: 'gmail-1', threadId: 'thread-1' }] } });
    },
    microsoftFetch: async () => { throw new Error('Microsoft fetch should not run'); },
  });

  const input = context({});
  const result = await lookup(input);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.receipt.providerMessageId, 'gmail-1');
  assert.equal(request.init.headers.authorization, 'Bearer provider-secret');
  assert.doesNotMatch(request.url, /provider-secret/);
  assert.doesNotMatch(JSON.stringify(result), /provider-secret/);
});

test('purpose mismatch fails closed before provider HTTP execution', async () => {
  let fetched = false;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => { fetched = true; return response({}); },
    microsoftFetch: async () => response({}),
  });
  const input = context({ providerSession: session({ purpose: 'mail.send' }) });
  await assert.rejects(() => lookup(input), (error) => error?.code === 'PROVIDER_CREDENTIAL_PURPOSE_MISMATCH');
  assert.equal(fetched, false);
});

test('action-subject mismatch fails closed before provider HTTP execution', async () => {
  let fetched = false;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => { fetched = true; return response({}); },
    microsoftFetch: async () => response({}),
  });
  const input = context({ actionId: 'act-1', providerSession: session({ actionId: 'act-other' }) });
  await assert.rejects(() => lookup(input), (error) => error?.code === 'PROVIDER_CREDENTIAL_PURPOSE_MISMATCH');
  assert.equal(fetched, false);
});

test('provider/account drift fails closed before credential use', async () => {
  let fetched = false;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => { fetched = true; return response({}); },
    microsoftFetch: async () => response({}),
  });
  const input = context({ accountId: 'acct-1', providerSession: session({ accountId: 'acct-other' }) });
  await assert.rejects(() => lookup(input), /account/i);
  assert.equal(fetched, false);
});

test('a successful purpose-bound provider lookup consumes the capability and rejects replay', async () => {
  let calls = 0;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => { calls += 1; return response({ json: {} }); },
    microsoftFetch: async () => response({}),
  });
  const input = context({});
  const first = await lookup(input);
  assert.equal(first.status, 'not_found');
  await assert.rejects(() => lookup(input), (error) => error?.code === 'PROVIDER_CREDENTIAL_CAPABILITY_CONSUMED');
  assert.equal(calls, 1);
});

test('calendar reconciliation is routed through the same exact purpose-bound capability', async () => {
  let request;
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async (url, init) => {
      request = { url, init };
      return response({ json: { items: [] } });
    },
    microsoftFetch: async () => response({}),
  });
  const input = context({ actionType: 'calendar.create' });
  const result = await lookup(input);
  assert.equal(result.status, 'not_found');
  assert.match(decodeURIComponent(request.url), /privateExtendedProperty=compassIdempotencyHash=/);
  assert.equal(request.init.headers.authorization, 'Bearer provider-secret');
});
