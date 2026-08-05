import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOperationalHealth,
  createHealthSignal,
  createSupportExport,
  deriveRecoveryAction,
  redactDiagnostics
} from '../src/operations/health.js';

const NOW = '2026-08-05T21:00:00.000Z';

test('builds latest-per-subsystem health and prioritizes blocked state', () => {
  const signals = [
    createHealthSignal({
      subsystem: 'gmail-sync', status: 'healthy', code: 'SYNC_OK', summary: 'Current', occurredAt: NOW
    }),
    createHealthSignal({
      subsystem: 'gmail-sync', status: 'degraded', code: 'OLD', summary: 'Old', occurredAt: '2026-08-05T20:00:00Z'
    }),
    createHealthSignal({
      subsystem: 'action-execution', status: 'blocked', code: 'CONSENT_REQUIRED', summary: 'Write consent missing',
      occurredAt: NOW, provider: 'google', reconnectRequired: true
    })
  ];

  const health = buildOperationalHealth({ signals, now: NOW });
  assert.equal(health.overall, 'blocked');
  assert.equal(health.subsystems.length, 2);
  assert.equal(health.subsystems.find((item) => item.subsystem === 'gmail-sync').code, 'SYNC_OK');
  assert.equal(health.recovery[0].action, 'reconnect');
});

test('derives user-safe retry, reconnect, review, and no-op recovery', () => {
  const base = { subsystem: 'mail', status: 'degraded', code: 'X', summary: 'x', occurredAt: NOW };
  assert.equal(deriveRecoveryAction(createHealthSignal({ ...base, retryable: true })).action, 'retry');
  assert.equal(deriveRecoveryAction(createHealthSignal({ ...base, reconnectRequired: true })).action, 'reconnect');
  assert.equal(deriveRecoveryAction(createHealthSignal(base)).action, 'review');
  assert.equal(deriveRecoveryAction(createHealthSignal({ ...base, status: 'healthy' })).action, 'none');
});

test('redacts secret keys, bearer values, and email addresses recursively', () => {
  const redacted = redactDiagnostics({
    accessToken: 'secret-token',
    nested: { authorization: 'Bearer abc.def.ghi', note: 'Contact person@example.com' },
    list: [{ api_key: 'key' }, 'owner@example.com']
  });

  assert.equal(redacted.accessToken, '[REDACTED]');
  assert.equal(redacted.nested.authorization, '[REDACTED]');
  assert.equal(redacted.nested.note, 'Contact [EMAIL]');
  assert.equal(redacted.list[0].api_key, '[REDACTED]');
  assert.equal(redacted.list[1], '[EMAIL]');
});

test('support export pseudonymizes owner and account identifiers by default', () => {
  const signal = createHealthSignal({
    subsystem: 'microsoft-sync', status: 'degraded', code: 'THROTTLED', summary: 'Mailbox user@example.com throttled',
    occurredAt: NOW, accountId: 'account-123', provider: 'microsoft', retryable: true,
    metadata: { retryAfterMs: 30000, refresh_token: 'never-export' }
  });
  const health = buildOperationalHealth({ signals: [signal], now: NOW });
  const support = createSupportExport({ ownerId: 'user-123', health, recentSignals: [signal] });

  assert.match(support.owner, /^anon_/);
  assert.match(support.signals[0].accountId, /^anon_/);
  assert.equal(support.signals[0].summary, 'Mailbox [EMAIL] throttled');
  assert.equal(support.signals[0].metadata.refresh_token, '[REDACTED]');
  assert.equal(JSON.stringify(support).includes('never-export'), false);
  assert.equal(JSON.stringify(support).includes('user@example.com'), false);
});

test('rejects malformed health inputs', () => {
  assert.throws(() => createHealthSignal({ subsystem: '', status: 'healthy', code: 'X', summary: 'x', occurredAt: NOW }));
  assert.throws(() => createHealthSignal({ subsystem: 'mail', status: 'bad', code: 'X', summary: 'x', occurredAt: NOW }));
  assert.throws(() => createHealthSignal({ subsystem: 'mail', status: 'healthy', code: 'X', summary: 'x', occurredAt: 'bad' }));
  assert.throws(() => buildOperationalHealth({ signals: [], now: 'bad' }));
});
