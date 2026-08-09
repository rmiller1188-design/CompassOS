import test from 'node:test';
import assert from 'node:assert/strict';

import { createContainedProviderSession } from '../src/actions/provider-session-credential.js';
import { createPurposeBoundProviderSession } from '../src/actions/purpose-bound-provider-session.js';
import { createPurposeBoundProviderReconciliationLookup } from '../src/actions/purpose-bound-reconciliation-adapters.js';
import {
  classifyReconciliationProviderError,
  getReconciliationProviderErrorPolicy,
  normalizeReconciliationProviderLookupError,
  parseProviderRetryAfter,
} from '../src/actions/reconciliation-provider-errors.js';

function providerSession(provider = 'google') {
  return createPurposeBoundProviderSession({
    session: createContainedProviderSession({ provider, accountId: 'acct-1', accessToken: 'provider-secret' }),
    purpose: 'reconciliation.lookup',
    subjectId: 'act-1',
  });
}

function input(provider = 'google') {
  return {
    account: { id: 'acct-1', provider, status: 'active' },
    reconciliation: { actionId: 'act-1', actionType: 'mail.reply', idempotencyKeyHash: 'a'.repeat(64), status: 'pending' },
    action: { actionType: 'mail.reply' },
    providerSession: providerSession(provider),
  };
}

function response({ status, json, headers = {} }) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    type: 'basic',
    headers: { get: (key) => normalized[String(key).toLowerCase()] || null },
    json: async () => json,
  };
}

test('Retry-After accepts delta seconds and HTTP dates but remains bounded', () => {
  const now = new Date('2026-08-09T17:00:00.000Z');
  assert.equal(parseProviderRetryAfter('12.5', { now }), 12_500);
  assert.equal(parseProviderRetryAfter('Sun, 09 Aug 2026 17:00:30 GMT', { now }), 30_000);
  assert.equal(parseProviderRetryAfter('999999', { now }), getReconciliationProviderErrorPolicy().maxRetryAfterMs);
  assert.equal(parseProviderRetryAfter('not-a-date', { now }), null);
});

test('purpose-bound 429 provider failures are sanitized and remain retryable', async () => {
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => response({
      status: 429,
      headers: { 'retry-after': '7', 'content-type': 'application/json' },
      json: { error: { code: 'rateLimitExceeded', message: 'secret mailbox detail should never escape' } },
    }),
    microsoftFetch: async () => { throw new Error('unused'); },
  });

  await assert.rejects(() => lookup(input()), (error) => {
    assert.equal(error.code, 'PROVIDER_RATE_LIMITED');
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 7000);
    assert.equal(error.providerCode, 'rateLimitExceeded');
    assert.doesNotMatch(error.message, /secret mailbox detail/i);
    assert.deepEqual(classifyReconciliationProviderError(error), {
      disposition: 'retry_later',
      resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT',
      retryAfterMs: 7000,
    });
    return true;
  });
});

test('HTTP-date Retry-After survives the canonical Google reconciliation adapter', async () => {
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => response({
      status: 429,
      headers: { 'retry-after': 'Wed, 31 Dec 2099 23:59:59 GMT', 'content-type': 'application/json' },
      json: { error: { code: 'rateLimitExceeded', message: 'provider detail' } },
    }),
    microsoftFetch: async () => { throw new Error('unused'); },
  });

  await assert.rejects(() => lookup(input('google')), (error) => {
    assert.equal(error.code, 'PROVIDER_RATE_LIMITED');
    assert.equal(error.retryAfterMs, getReconciliationProviderErrorPolicy().maxRetryAfterMs);
    assert.deepEqual(classifyReconciliationProviderError(error), {
      disposition: 'retry_later',
      resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT',
      retryAfterMs: getReconciliationProviderErrorPolicy().maxRetryAfterMs,
    });
    return true;
  });
});

test('HTTP-date Retry-After survives the canonical Microsoft reconciliation adapter', async () => {
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => { throw new Error('unused'); },
    microsoftFetch: async () => response({
      status: 503,
      headers: { 'retry-after': 'Wed, 31 Dec 2099 23:59:59 GMT', 'content-type': 'application/json' },
      json: { error: { code: 'ServiceUnavailable', message: 'provider detail' } },
    }),
  });

  await assert.rejects(() => lookup(input('microsoft')), (error) => {
    assert.equal(error.code, 'PROVIDER_TRANSIENT');
    assert.equal(error.status, 503);
    assert.equal(error.retryAfterMs, getReconciliationProviderErrorPolicy().maxRetryAfterMs);
    assert.equal(error.providerCode, 'ServiceUnavailable');
    return true;
  });
});

test('authorization failures normalize to reconnect without provider body leakage', async () => {
  const lookup = createPurposeBoundProviderReconciliationLookup({
    googleFetch: async () => response({
      status: 401,
      headers: { 'content-type': 'application/json' },
      json: { error: { code: 'invalidCredentials', message: 'raw provider auth diagnostic' } },
    }),
    microsoftFetch: async () => { throw new Error('unused'); },
  });

  await assert.rejects(() => lookup(input()), (error) => {
    assert.equal(error.code, 'PROVIDER_AUTH_REQUIRED');
    assert.doesNotMatch(error.message, /raw provider auth diagnostic/i);
    assert.equal(classifyReconciliationProviderError(error).resolutionCode, 'PROVIDER_RECONNECT_REQUIRED');
    return true;
  });
});

test('408 and 425 remain transient through the existing retry admission contract', () => {
  for (const status of [408, 425]) {
    const original = Object.assign(new Error('provider detail'), { status, code: 'provider_specific_code' });
    const normalized = normalizeReconciliationProviderLookupError(original);
    assert.equal(normalized.code, 'PROVIDER_TRANSIENT');
    assert.ok(normalized.retryAfterMs > 0);
    assert.equal(classifyReconciliationProviderError(normalized).disposition, 'retry_later');
  }
});

test('non-transient 4xx failures fail closed to manual review', () => {
  const normalized = normalizeReconciliationProviderLookupError(Object.assign(new Error('provider detail'), { status: 400, code: 'BadRequest' }));
  assert.equal(normalized.code, 'PROVIDER_REQUEST_REJECTED');
  assert.equal(normalized.providerCode, 'BadRequest');
  assert.deepEqual(classifyReconciliationProviderError(normalized), {
    disposition: 'manual_review',
    resolutionCode: 'PROVIDER_LOOKUP_FAILED',
    retryAfterMs: null,
  });
});

test('response and egress boundary failures are preserved instead of being reinterpreted', () => {
  const boundary = Object.assign(new Error('malformed JSON'), { code: 'PROVIDER_RESPONSE_INVALID_JSON', status: 200 });
  assert.equal(normalizeReconciliationProviderLookupError(boundary), boundary);
});
