import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorizationUrl, exchangeAuthorizationCode, fetchProviderIdentity, normalizeTokenSet, OAuthProviderError, refreshAccessToken, revokeProviderToken, shouldRefreshToken } from '../src/oauth/runtime.js';

function response(status, payload) {
  return new Response(payload === undefined ? '' : JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

test('builds Google authorization URL with PKCE and offline consent', () => {
  const url = new URL(buildAuthorizationUrl({ provider: 'google', clientId: 'client', redirectUri: 'https://app.test/callback', scopes: ['openid','email'], state: 'state', codeChallenge: 'challenge' }));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
});

test('exchanges authorization code and normalizes expiry', async () => {
  const token = await exchangeAuthorizationCode({ provider: 'google', clientId: 'c', clientSecret: 's', redirectUri: 'https://app.test/cb', code: 'code', codeVerifier: 'verifier', fetchImpl: async (_url, init) => {
    assert.match(init.body.toString(), /grant_type=authorization_code/);
    return response(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid email' });
  }});
  assert.equal(token.refreshToken, 'r');
  assert.deepEqual(token.scope, ['openid','email']);
});

test('refresh preserves prior refresh token when provider omits rotation', async () => {
  const token = await refreshAccessToken({ provider: 'microsoft', clientId: 'c', refreshToken: 'old', fetchImpl: async () => response(200, { access_token: 'new', expires_in: 100 }) });
  assert.equal(token.refreshToken, 'old');
});

test('maps transient provider failures to retryable typed error', async () => {
  await assert.rejects(() => exchangeAuthorizationCode({ provider: 'google', clientId: 'c', redirectUri: 'https://app.test/cb', code: 'code', codeVerifier: 'verifier', fetchImpl: async () => response(503, { error: 'temporarily_unavailable', error_description: 'retry later' }) }), error => {
    assert.ok(error instanceof OAuthProviderError);
    assert.equal(error.retryable, true);
    assert.equal(error.code, 'temporarily_unavailable');
    return true;
  });
});

test('normalizes provider identities', async () => {
  const google = await fetchProviderIdentity({ provider: 'google', accessToken: 'a', fetchImpl: async () => response(200, { sub: 'g1', email: 'a@example.com', name: 'A' }) });
  const microsoft = await fetchProviderIdentity({ provider: 'microsoft', accessToken: 'a', fetchImpl: async () => response(200, { id: 'm1', userPrincipalName: 'm@example.com', displayName: 'M' }) });
  assert.equal(google.providerSubject, 'g1');
  assert.equal(microsoft.email, 'm@example.com');
});

test('Google revocation posts token while Microsoft records local disconnect requirement', async () => {
  let called = false;
  const google = await revokeProviderToken({ provider: 'google', token: 'r', fetchImpl: async () => { called = true; return response(200); } });
  const microsoft = await revokeProviderToken({ provider: 'microsoft', token: 'r', fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal(called, true);
  assert.equal(google.revoked, true);
  assert.equal(microsoft.revoked, false);
});

test('refresh threshold uses configurable clock skew', () => {
  const now = Date.parse('2026-08-03T17:00:00Z');
  const token = normalizeTokenSet('google', { access_token: 'a', expires_in: 180 }, { now });
  assert.equal(shouldRefreshToken(token, { now, skewSeconds: 120 }), false);
  assert.equal(shouldRefreshToken(token, { now: now + 61_000, skewSeconds: 120 }), true);
});
