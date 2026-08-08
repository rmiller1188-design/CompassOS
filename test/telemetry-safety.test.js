import test from 'node:test';
import assert from 'node:assert/strict';

import { createContainedProviderSession } from '../src/actions/provider-session-credential.js';
import {
  createWorkerTelemetryEvent,
  sanitizeTelemetry,
  telemetryAccountRef,
} from '../src/operations/telemetry-safety.js';

test('sanitizes secret-bearing keys without reading nested bearer values', () => {
  const output = sanitizeTelemetry({
    authorization: 'Bearer secret-value',
    nested: { access_token: 'abc123', ok: 'safe' },
  });
  assert.deepEqual(output, {
    authorization: '[REDACTED]',
    nested: { access_token: '[REDACTED]', ok: 'safe' },
  });
});

test('redacts bearer tokens, JWTs, and OAuth query parameters in strings', () => {
  const output = sanitizeTelemetry({
    message: 'Authorization failed: Bearer abc.def-123',
    jwt: 'bad eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature token',
    url: 'https://example.test/callback?code=secret-code&access_token=secret-token&state=ok',
  });
  assert.equal(output.message, 'Authorization failed: Bearer [REDACTED]');
  assert.equal(output.jwt, 'bad [JWT_REDACTED] token');
  assert.equal(output.url, 'https://example.test/callback?code=[REDACTED]&access_token=[REDACTED]&state=ok');
});

test('capability-only provider sessions serialize only provider metadata and pseudonymous account reference', () => {
  const session = createContainedProviderSession({ provider: 'google', accountId: 'account-123', accessToken: 'top-secret' });
  const output = sanitizeTelemetry({ session });
  assert.equal(output.session.provider, 'google');
  assert.equal(output.session.accountRef, telemetryAccountRef('account-123'));
  assert.equal(output.session.credential, 'ephemeral');
  assert.equal(output.session.credentialMode, 'capability-only');
  assert.equal(JSON.stringify(output).includes('top-secret'), false);
  assert.equal(JSON.stringify(output).includes('account-123'), false);
});

test('legacy session-shaped objects are not trusted and non-enumerable token getters are never read', () => {
  let reads = 0;
  const object = { provider: 'google', accountId: 'acct', withAccessToken: async () => undefined };
  Object.defineProperty(object, 'accessToken', {
    enumerable: false,
    get() {
      reads += 1;
      return 'should-not-be-read';
    },
  });
  const output = sanitizeTelemetry(object);
  assert.equal(reads, 0);
  assert.equal(output.provider, 'google');
  assert.equal(output.accountId, 'acct');
  assert.equal(output.withAccessToken, '[OMITTED]');
  assert.equal('credential' in output, false);
});

test('handles errors without emitting secret headers or arbitrary enumerable fields', () => {
  const error = new Error('request failed Bearer abc123');
  error.code = 'provider_timeout';
  error.status = 503;
  error.authorization = 'Bearer leaked';
  const output = sanitizeTelemetry(error);
  assert.deepEqual(output, {
    name: 'Error',
    message: 'request failed Bearer [REDACTED]',
    code: 'provider_timeout',
    status: 503,
    retryAfter: undefined,
  });
  assert.equal('authorization' in output, false);
});

test('handles circular telemetry safely', () => {
  const value = { ok: true };
  value.self = value;
  assert.deepEqual(sanitizeTelemetry(value), { ok: true, self: '[CIRCULAR]' });
});

test('enforces depth and string size bounds', () => {
  const output = sanitizeTelemetry({ a: { b: { c: 'x'.repeat(500) } } }, { maxDepth: 2, maxStringLength: 128 });
  assert.deepEqual(output, { a: { b: '[MAX_DEPTH]' } });
  const text = sanitizeTelemetry('x'.repeat(500), { maxStringLength: 128 });
  assert.match(text, /\[TRUNCATED\]$/);
  assert.ok(text.length < 160);
});

test('worker telemetry event excludes raw account id and access token', () => {
  const session = createContainedProviderSession({ provider: 'microsoft', accountId: 'real-account-id', accessToken: 'real-access-token' });
  const event = createWorkerTelemetryEvent({
    event: 'reconciliation.lookup.retry_scheduled',
    subsystem: 'reconciliation',
    occurredAt: '2026-08-08T18:00:00.000Z',
    actionId: 'action-1',
    providerSession: session,
    metadata: {
      providerSession: session,
      authorization: 'Bearer real-access-token',
      url: 'https://graph.microsoft.com/v1.0/me/messages?access_token=real-access-token',
      retryAfterSeconds: 12,
    },
  });
  const json = JSON.stringify(event);
  assert.equal(event.provider, 'microsoft');
  assert.equal(event.accountRef, telemetryAccountRef('real-account-id'));
  assert.equal(json.includes('real-account-id'), false);
  assert.equal(json.includes('real-access-token'), false);
  assert.equal(event.metadata.authorization, '[REDACTED]');
  assert.match(event.metadata.url, /access_token=\[REDACTED\]/);
});

test('worker telemetry event rejects legacy or uncontained session-shaped values', () => {
  assert.throws(() => createWorkerTelemetryEvent({
    event: 'lookup',
    subsystem: 'reconciliation',
    providerSession: { provider: 'google', accountId: 'a', accessToken: 'bad' },
  }), /Capability-only contained provider session is required/);
  assert.throws(() => createWorkerTelemetryEvent({
    event: 'lookup',
    subsystem: 'reconciliation',
    providerSession: { provider: 'google', accountId: 'a', withAccessToken: async () => undefined },
  }), /Capability-only contained provider session is required/);
});

test('account telemetry references are deterministic but do not expose account ids', () => {
  const first = telemetryAccountRef('account-a');
  const second = telemetryAccountRef('account-a');
  assert.equal(first, second);
  assert.match(first, /^acct_[a-f0-9]{16}$/);
  assert.equal(first.includes('account-a'), false);
});
