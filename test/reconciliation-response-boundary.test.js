import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProviderCorrelation, createGmailReconciliationLookup } from '../src/actions/provider-reconciliation.js';
import { createReconciliationEgressFetch, getReconciliationEgressPolicy } from '../src/actions/reconciliation-egress-policy.js';

const gmailUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=2';
const bearer = { method: 'GET', headers: { authorization: 'Bearer provider-secret' } };

function headerResponse({
  ok = true,
  status = 200,
  json = {},
  url = '',
  redirected = false,
  type = 'basic',
  headers = {},
} = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok,
    status,
    url,
    redirected,
    type,
    headers: { get: (key) => normalized[String(key).toLowerCase()] || null },
    json: async () => json,
  };
}

test('reconciliation response policy exposes a fixed 256 KiB provider body ceiling', () => {
  assert.equal(getReconciliationEgressPolicy().maxProviderResponseBytes, 256 * 1024);
});

test('declared oversized provider responses fail closed before JSON decoding', async () => {
  let decoded = false;
  const fetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => ({
      ...headerResponse({ headers: { 'content-length': String((256 * 1024) + 1), 'content-type': 'application/json' } }),
      json: async () => { decoded = true; return {}; },
    }),
  });

  await assert.rejects(() => fetch(gmailUrl, bearer), (error) => error?.code === 'PROVIDER_RESPONSE_TOO_LARGE');
  assert.equal(decoded, false);
});

test('unexpected provider response media types are rejected before reconciliation parsing', async () => {
  const fetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => headerResponse({ headers: { 'content-type': 'text/html' } }),
  });
  await assert.rejects(() => fetch(gmailUrl, bearer), (error) => error?.code === 'PROVIDER_RESPONSE_CONTENT_TYPE_BLOCKED');
});

test('redirected and off-route final provider responses fail closed', async () => {
  const redirected = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => headerResponse({ redirected: true, url: gmailUrl, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(() => redirected(gmailUrl, bearer), (error) => error?.code === 'PROVIDER_RESPONSE_REDIRECT_BLOCKED');

  const wrongOrigin = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => headerResponse({ url: 'https://example.com/gmail/v1/users/me/messages', headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(() => wrongOrigin(gmailUrl, bearer), (error) => error?.code === 'PROVIDER_EGRESS_ORIGIN_BLOCKED');
});

test('chunked provider bodies are bounded by bytes even without Content-Length', async () => {
  const fetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => new Response(JSON.stringify({ padding: 'x'.repeat(256 * 1024) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(() => fetch(gmailUrl, bearer), (error) => error?.code === 'PROVIDER_RESPONSE_TOO_LARGE');
});

test('malformed successful provider JSON cannot become confirmed absence', async () => {
  const guardedFetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const lookup = createGmailReconciliationLookup({
    fetchImpl: guardedFetch,
    tokenResolver: async () => 'provider-secret',
  });
  const hash = buildProviderCorrelation('p7u-malformed-json').digest;

  await assert.rejects(
    () => lookup({ account: { id: 'acct-1', provider: 'google' }, reconciliation: { idempotencyKeyHash: hash } }),
    (error) => error?.code === 'PROVIDER_RESPONSE_INVALID_JSON',
  );
});

test('small valid JSON remains compatible with Gmail reconciliation', async () => {
  const guardedFetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async () => new Response(JSON.stringify({ messages: [{ id: 'provider-message-1', threadId: 'thread-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  });
  const lookup = createGmailReconciliationLookup({
    fetchImpl: guardedFetch,
    tokenResolver: async () => 'provider-secret',
  });
  const hash = buildProviderCorrelation('p7u-valid-json').digest;
  const result = await lookup({ account: { id: 'acct-1', provider: 'google' }, reconciliation: { idempotencyKeyHash: hash } });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.receipt.providerMessageId, 'provider-message-1');
});
