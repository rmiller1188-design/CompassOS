import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createM26OAuthStores } from '../src/runtime/m26-oauth-stores.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const config = { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'service-secret' };

test('OAuth state consumption hashes the browser nonce and uses the atomic RPC', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return jsonResponse([{ nonce_hash: 'stored', owner_id: 'user-1', provider: 'microsoft', verifier_envelope: { x: 1 }, redirect_uri: 'https://app/callback', redirect_to: '/settings/accounts', expires_at: '2026-08-11T20:00:00Z', created_at: '2026-08-11T19:00:00Z' }]);
  };
  const { stateStore } = createM26OAuthStores({ ...config, fetchImpl });
  const result = await stateStore.consume('browser-nonce');
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/consume_oauth_state');
  assert.equal(calls[0].body.p_nonce_hash, createHash('sha256').update('browser-nonce').digest('hex'));
  assert.equal(result.userId, 'user-1');
  assert.equal(result.provider, 'microsoft');
});

test('provider connection and encrypted credential are persisted through one atomic RPC', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return jsonResponse([{ id: 'conn-1', owner_id: 'user-1', provider: 'google', external_account_id: 'sub-1', account_email: 'owner@example.com', display_name: 'Owner', status: 'healthy', scopes: ['openid'], token_expires_at: '2026-08-11T20:00:00Z' }]);
  };
  const { accountStore } = createM26OAuthStores({ ...config, fetchImpl });
  const tokenEnvelope = { version: 1, algorithm: 'aes-256-gcm', ciphertext: 'cipher', iv: 'iv', tag: 'tag', context: {} };
  const account = await accountStore.upsert({ userId: 'user-1', provider: 'google', providerSubject: 'sub-1', email: 'owner@example.com', displayName: 'Owner', scopes: ['openid'], expiresAt: '2026-08-11T20:00:00Z', tokenEnvelope });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/upsert_provider_connection_with_credential');
  assert.equal(calls[0].body.p_encrypted_payload, 'cipher');
  assert.equal(calls[0].body.p_auth_tag, 'tag');
  assert.equal(account.id, 'conn-1');
  assert.equal(account.tokenEnvelope, tokenEnvelope);
});

test('service-store failures return stable local errors rather than provider payloads', async () => {
  const fetchImpl = async () => jsonResponse({ message: 'database secret diagnostics' }, 500);
  const { stateStore } = createM26OAuthStores({ ...config, fetchImpl });
  await assert.rejects(() => stateStore.consume('nonce'), (error) => {
    assert.equal(error.message, 'Supabase OAuth store request failed');
    assert.equal(error.status, 500);
    assert.equal(error.message.includes('secret diagnostics'), false);
    return true;
  });
});
