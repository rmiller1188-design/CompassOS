import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeHealth, probeSupabase } from '../src/operations/runtime-health.js';

const completeEnv = Object.freeze({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
  TOKEN_ENVELOPE_KEY: 'base64-key-value',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GOOGLE_REDIRECT_URI: 'https://compass.example/api/oauth/google/callback',
  MICROSOFT_CLIENT_ID: 'microsoft-client',
  MICROSOFT_CLIENT_SECRET: 'microsoft-secret',
  MICROSOFT_REDIRECT_URI: 'https://compass.example/api/oauth/microsoft/callback',
  OPENAI_API_KEY: 'openai-key',
});

test('runtime health is ready when configuration is complete and Supabase is reachable', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const health = await createRuntimeHealth({ env: completeEnv, fetchImpl, version: '0.51.0' });
  assert.equal(health.ready, true);
  assert.equal(health.version, '0.51.0');
  assert.equal(health.dependencies.supabase.reachable, true);
  assert.deepEqual(health.runtime.missing, []);
});

test('runtime health fails closed when required provider configuration is missing', async () => {
  const env = { ...completeEnv };
  delete env.OPENAI_API_KEY;
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const health = await createRuntimeHealth({ env, fetchImpl, version: '0.51.0' });
  assert.equal(health.ready, false);
  assert.deepEqual(health.runtime.missing, ['OPENAI_API_KEY']);
});

test('Supabase probe does not attempt a request without server credentials', async () => {
  let called = false;
  const result = await probeSupabase({ env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.deepEqual(result, { configured: false, reachable: false });
});

test('Supabase probe reports backend failure without exposing response content', async () => {
  const result = await probeSupabase({
    env: completeEnv,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.deepEqual(result, { configured: true, reachable: false, status: 503 });
});
