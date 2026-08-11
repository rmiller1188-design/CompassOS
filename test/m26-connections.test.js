import assert from 'node:assert/strict';
import test from 'node:test';
import { listOwnedM26Connections, safeConnectionsFailure } from '../src/runtime/m26-connections.js';

const env = Object.freeze({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
});

test('lists bounded M26 connection metadata through the user RLS session', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return [{
          id: 'connection-1',
          provider: 'google',
          account_email: 'owner@example.com',
          display_name: 'Owner',
          status: 'healthy',
          scopes: ['mail.read', 'calendar.read'],
          token_expires_at: '2026-08-12T00:00:00Z',
          last_sync_at: '2026-08-11T19:00:00Z',
          encrypted_payload: 'must-not-cross-boundary',
        }];
      },
    };
  };

  const result = await listOwnedM26Connections({ accessToken: 'user-jwt', env, fetchImpl });
  assert.deepEqual(result, [{
    id: 'connection-1',
    provider: 'google',
    email: 'owner@example.com',
    displayName: 'Owner',
    status: 'healthy',
    scopes: ['mail.read', 'calendar.read'],
    tokenExpiresAt: '2026-08-12T00:00:00Z',
    lastSyncAt: '2026-08-11T19:00:00Z',
  }]);
  assert.match(request.url, /provider_connections/);
  assert.equal(request.url.includes('provider_credentials'), false);
  assert.equal(request.url.includes('encrypted_payload'), false);
  assert.equal(request.options.headers.authorization, 'Bearer user-jwt');
  assert.equal(request.options.headers.apikey, 'publishable-key');
});

test('connection metadata adapter requires an authenticated bearer session', async () => {
  await assert.rejects(
    listOwnedM26Connections({ accessToken: '', env, fetchImpl: async () => { throw new Error('must not run'); } }),
    (error) => error.code === 'authentication_required' && error.status === 401,
  );
});

test('backend failures are normalized without copying provider diagnostics', async () => {
  let thrown;
  try {
    await listOwnedM26Connections({
      accessToken: 'user-jwt',
      env,
      fetchImpl: async () => ({ ok: false, status: 500, async text() { return 'secret database diagnostics'; } }),
    });
  } catch (error) {
    thrown = error;
  }
  assert.deepEqual(safeConnectionsFailure(thrown), {
    status: 503,
    body: { error: 'connections_backend_rejected' },
  });
  assert.equal(JSON.stringify(safeConnectionsFailure(thrown)).includes('diagnostics'), false);
});

test('malformed rows and unsupported providers fail closed', async () => {
  await assert.rejects(
    listOwnedM26Connections({
      accessToken: 'user-jwt',
      env,
      fetchImpl: async () => ({ ok: true, async json() { return [{ id: 'x', provider: 'imap' }]; } }),
    }),
    (error) => error.code === 'connections_backend_invalid_response',
  );
});
