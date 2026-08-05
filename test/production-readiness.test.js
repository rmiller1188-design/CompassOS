import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateProductionReadiness,
  inspectMigrationManifest,
  inspectRuntimeConfiguration,
} from '../src/operations/production-readiness.js';

const migrations = [
  '20260803_secure_account_foundation.sql',
  '20260804_mail_sync_persistence.sql',
  '20260804_retry_worker_dead_letter.sql',
  '20260805_action_queue_leases.sql',
  '20260805_calendar_execution_receipts.sql',
  '20260805_encrypted_action_audit.sql',
  '20260805_mail_execution_receipts.sql',
  '20260805_memory_semantic_search.sql',
];

test('runtime readiness requires server-only secrets for enabled providers', () => {
  const result = inspectRuntimeConfiguration({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      TOKEN_ENVELOPE_KEY: 'envelope-key',
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      GOOGLE_REDIRECT_URI: 'https://app.example.test/oauth/google/callback',
      OPENAI_API_KEY: 'openai-key',
    },
    enabledProviders: ['google', 'openai'],
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
  assert.equal(result.configuredKeyFingerprints.length, 7);
  assert.equal(JSON.stringify(result).includes('service-role'), false);
  assert.equal(JSON.stringify(result).includes('openai-key'), false);
});

test('runtime readiness fails closed for public secret exposure and missing configuration', () => {
  const result = inspectRuntimeConfiguration({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_OPENAI_API_KEY: 'must-not-be-public',
    },
    enabledProviders: ['microsoft'],
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.unsafeExposure, ['VITE_OPENAI_API_KEY']);
  assert.ok(result.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(result.missing.includes('MICROSOFT_CLIENT_SECRET'));
});

test('migration manifest is deterministic, ordered, and duplicate-sensitive', () => {
  const result = inspectMigrationManifest(migrations);
  assert.equal(result.ready, true);
  assert.equal(result.count, 8);
  assert.match(result.manifestHash, /^[a-f0-9]{64}$/);

  const outOfOrder = inspectMigrationManifest([migrations[1], migrations[0]]);
  assert.equal(outOfOrder.ready, false);
  assert.equal(outOfOrder.outOfOrder, true);

  const duplicate = inspectMigrationManifest([migrations[0], migrations[0]]);
  assert.equal(duplicate.ready, false);
  assert.deepEqual(duplicate.duplicates, [migrations[0]]);
});

test('readiness distinguishes infrastructure blockers from failed validation', () => {
  const runtime = inspectRuntimeConfiguration({
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      TOKEN_ENVELOPE_KEY: 'envelope-key',
    },
  });
  const manifest = inspectMigrationManifest(migrations);

  const blocked = evaluateProductionReadiness({
    runtime,
    migrations: manifest,
    validations: [
      { id: 'unit-suite', status: 'passed', evidence: 'npm run validate' },
      { id: 'live-supabase', status: 'blocked', evidence: 'credentials unavailable' },
    ],
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.disposition, 'infrastructure-blocked');
  assert.deepEqual(blocked.blockedValidationIds, ['live-supabase']);

  const failed = evaluateProductionReadiness({
    runtime,
    migrations: manifest,
    validations: [{ id: 'rls-isolation', status: 'failed' }],
  });
  assert.equal(failed.disposition, 'failed');
  assert.deepEqual(failed.failedValidationIds, ['rls-isolation']);
});

test('invalid providers, migrations, and validation records are rejected', () => {
  const runtime = inspectRuntimeConfiguration({ env: {}, enabledProviders: ['imap'] });
  assert.deepEqual(runtime.malformed, ['unsupported-provider:imap']);
  assert.throws(() => inspectMigrationManifest(['migration.sql']), /invalid migration name/);
  assert.throws(
    () => evaluateProductionReadiness({ runtime: {}, migrations: {}, validations: [{ id: 'x', status: 'unknown' }] }),
    /validation requires/,
  );
});
