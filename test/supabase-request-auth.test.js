import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateSupabaseRequest, extractBearerToken, safeAuthFailure } from '../src/security/supabase-request-auth.js';

const env = Object.freeze({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
});

test('extracts only a single well-formed bearer credential', () => {
  assert.equal(extractBearerToken({ authorization: 'Bearer user-jwt' }), 'user-jwt');
  assert.throws(() => extractBearerToken({}), /authentication_required/);
  assert.throws(() => extractBearerToken({ authorization: 'Basic abc' }), /invalid_authorization_header/);
  assert.throws(() => extractBearerToken({ authorization: ['Bearer a', 'Bearer b'] }), /invalid_authorization_header/);
});

test('validates bearer session against Supabase Auth and returns a bounded user shape', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { id: 'user-123', email: 'owner@example.com', role: 'authenticated', user_metadata: { ignored: true } };
      },
    };
  };
  const user = await authenticateSupabaseRequest({
    headers: { authorization: 'Bearer secret-user-jwt' },
    env,
    fetchImpl,
  });
  assert.deepEqual(user, { id: 'user-123', email: 'owner@example.com', role: 'authenticated' });
  assert.equal(request.url, 'https://example.supabase.co/auth/v1/user');
  assert.equal(request.options.headers.apikey, 'publishable-key');
  assert.equal(request.options.headers.authorization, 'Bearer secret-user-jwt');
});

test('invalid Supabase session fails closed without returning provider response content', async () => {
  await assert.rejects(
    authenticateSupabaseRequest({
      headers: { authorization: 'Bearer invalid' },
      env,
      fetchImpl: async () => ({ ok: false, status: 401, async text() { return 'provider diagnostics'; } }),
    }),
    (error) => error.code === 'invalid_or_expired_session' && error.status === 401,
  );
});

test('missing auth backend configuration is a safe service-unavailable failure', async () => {
  await assert.rejects(
    authenticateSupabaseRequest({ headers: { authorization: 'Bearer token' }, env: {} }),
    (error) => error.code === 'authentication_backend_not_configured' && error.status === 503,
  );
});

test('malformed auth response fails closed and safeAuthFailure does not expose thrown text', async () => {
  let thrown;
  try {
    await authenticateSupabaseRequest({
      headers: { authorization: 'Bearer token' },
      env,
      fetchImpl: async () => ({ ok: true, async json() { return { email: 'missing-id@example.com' }; } }),
    });
  } catch (error) {
    thrown = error;
  }
  assert.deepEqual(safeAuthFailure(thrown), {
    status: 503,
    body: { error: 'authentication_backend_invalid_response' },
  });
});
