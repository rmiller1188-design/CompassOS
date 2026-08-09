import test from 'node:test';
import assert from 'node:assert/strict';

import { createReconciliationEgressFetch } from '../src/actions/reconciliation-egress-policy.js';

function okResponse() {
  return { ok: true, status: 200, json: async () => ({}) };
}

function bearerInit(extra = {}) {
  return { method: 'GET', headers: { authorization: 'Bearer provider-secret' }, ...extra };
}

test('Gmail reconciliation egress allows only the canonical sent-message lookup path and hardens fetch options', async () => {
  let request;
  const fetch = createReconciliationEgressFetch({
    provider: 'google',
    kind: 'mail',
    fetchImpl: async (url, init) => { request = { url, init }; return okResponse(); },
  });

  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Asent&maxResults=2', bearerInit());
  assert.equal(request.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Asent&maxResults=2');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.referrerPolicy, 'no-referrer');
  assert.equal(request.init.headers.authorization, 'Bearer provider-secret');
});

test('Google Calendar reconciliation allows canonical collection and event paths', async () => {
  const requests = [];
  const fetch = createReconciliationEgressFetch({ provider: 'google', kind: 'calendar', fetchImpl: async (url) => { requests.push(url); return okResponse(); } });
  await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=2', bearerInit());
  await fetch('https://www.googleapis.com/calendar/v3/calendars/team%40example.com/events/event-1', bearerInit());
  assert.equal(requests.length, 2);
});

test('Microsoft reconciliation allows the exact Graph mail and calendar surfaces', async () => {
  let calls = 0;
  const baseFetch = async () => { calls += 1; return okResponse(); };
  const mail = createReconciliationEgressFetch({ provider: 'microsoft', kind: 'mail', fetchImpl: baseFetch });
  const calendar = createReconciliationEgressFetch({ provider: 'microsoft', kind: 'calendar', fetchImpl: baseFetch });
  await mail('https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=2', bearerInit());
  await calendar('https://graph.microsoft.com/v1.0/me/events/event-1?$select=id', bearerInit());
  assert.equal(calls, 2);
});

test('provider-origin lookalikes and non-HTTPS origins fail closed before network execution', async () => {
  let calls = 0;
  const fetch = createReconciliationEgressFetch({ provider: 'google', kind: 'mail', fetchImpl: async () => { calls += 1; return okResponse(); } });
  await assert.rejects(() => fetch('https://gmail.googleapis.com.attacker.example/gmail/v1/users/me/messages', bearerInit()), (error) => error?.code === 'PROVIDER_EGRESS_ORIGIN_BLOCKED');
  await assert.rejects(() => fetch('http://gmail.googleapis.com/gmail/v1/users/me/messages', bearerInit()), (error) => error?.code === 'PROVIDER_EGRESS_ORIGIN_BLOCKED');
  assert.equal(calls, 0);
});

test('unexpected provider paths fail closed before bearer credentials reach fetch', async () => {
  let calls = 0;
  const fetch = createReconciliationEgressFetch({ provider: 'microsoft', kind: 'mail', fetchImpl: async () => { calls += 1; return okResponse(); } });
  await assert.rejects(() => fetch('https://graph.microsoft.com/v1.0/me/drive/root', bearerInit()), (error) => error?.code === 'PROVIDER_EGRESS_PATH_BLOCKED');
  assert.equal(calls, 0);
});

test('reconciliation egress rejects non-GET methods and request bodies', async () => {
  let calls = 0;
  const fetch = createReconciliationEgressFetch({ provider: 'microsoft', kind: 'calendar', fetchImpl: async () => { calls += 1; return okResponse(); } });
  const url = 'https://graph.microsoft.com/v1.0/me/events';
  await assert.rejects(() => fetch(url, bearerInit({ method: 'POST' })), (error) => error?.code === 'PROVIDER_EGRESS_METHOD_BLOCKED');
  await assert.rejects(() => fetch(url, bearerInit({ body: '{}' })), (error) => error?.code === 'PROVIDER_EGRESS_BODY_BLOCKED');
  assert.equal(calls, 0);
});

test('reconciliation egress rejects URLs containing credentials or fragments', async () => {
  let calls = 0;
  const fetch = createReconciliationEgressFetch({ provider: 'google', kind: 'calendar', fetchImpl: async () => { calls += 1; return okResponse(); } });
  await assert.rejects(() => fetch('https://user:pass@www.googleapis.com/calendar/v3/calendars/primary/events', bearerInit()), (error) => error?.code === 'PROVIDER_EGRESS_URL_BLOCKED');
  await assert.rejects(() => fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events#secret', bearerInit()), (error) => error?.code === 'PROVIDER_EGRESS_URL_BLOCKED');
  assert.equal(calls, 0);
});

test('reconciliation egress requires a bearer credential and rejects unsupported route profiles', async () => {
  const fetch = createReconciliationEgressFetch({ provider: 'google', kind: 'mail', fetchImpl: async () => okResponse() });
  await assert.rejects(() => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages', { method: 'GET' }), (error) => error?.code === 'PROVIDER_EGRESS_AUTH_REQUIRED');
  assert.throws(() => createReconciliationEgressFetch({ provider: 'google', kind: 'contacts', fetchImpl: async () => okResponse() }), (error) => error?.code === 'PROVIDER_EGRESS_ROUTE_UNSUPPORTED');
});
