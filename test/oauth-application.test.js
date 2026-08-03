import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { OAuthApplicationService } from '../src/oauth/application.js';

const encryptionKey = randomBytes(32);

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(payload); } };
}

function harness({ now = 1_700_000_000_000 } = {}) {
  const states = new Map();
  const accounts = new Map();
  const audits = [];
  let accountSequence = 0;
  const stateStore = {
    async create(value) { states.set(value.nonceHash, value); },
    async consume(nonce) {
      const hash = createHash('sha256').update(nonce).digest('hex');
      const value = states.get(hash) || null;
      states.delete(hash);
      return value;
    },
  };
  const accountStore = {
    async upsert(value) { const id = `acct-${++accountSequence}`; const row = { id, ...value }; accounts.set(id, row); return row; },
    async getOwned(userId, id) { const row = accounts.get(id); return row?.userId === userId ? row : null; },
    async updateTokens(id, patch) { accounts.set(id, { ...accounts.get(id), ...patch }); },
    async updateStatus(id, status) { accounts.set(id, { ...accounts.get(id), status }); },
    async disconnect(id) { accounts.set(id, { ...accounts.get(id), status: 'disconnected', tokenEnvelope: null }); },
  };
  const auditStore = { async append(event) { audits.push(event); } };
  const lockStore = { async withLock(_key, work) { return work(); } };
  return { states, accounts, audits, stateStore, accountStore, auditStore, lockStore, now };
}

function service(h, fetchImpl) {
  return new OAuthApplicationService({
    ...h,
    encryptionKey,
    fetchImpl,
    now: () => h.now,
    providerCredentials: {
      google: { clientId: 'google-client', clientSecret: 'google-secret' },
      microsoft: { clientId: 'ms-client', clientSecret: 'ms-secret' },
    },
  });
}

test('authorization start stores encrypted verifier and emits audit event', async () => {
  const h = harness();
  const result = await service(h, async () => { throw new Error('not called'); }).startAuthorization({ userId: 'user-1', provider: 'google', redirectUri: 'https://app/callback', features: { mail: true, calendar: true } });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('scope'), /gmail\.readonly/);
  assert.equal(h.states.size, 1);
  const stored = [...h.states.values()][0];
  assert.equal(stored.verifier, undefined);
  assert.ok(stored.verifierEnvelope.ciphertext);
  assert.equal(h.audits[0].action, 'oauth.authorization_started');
});

test('callback consumes state once and persists encrypted provider tokens', async () => {
  const h = harness();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/token')) return response(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/gmail.readonly' });
    return response(200, { sub: 'google-subject', email: 'ryan@example.com', name: 'Ryan' });
  };
  const app = service(h, fetchImpl);
  const start = await app.startAuthorization({ userId: 'user-1', provider: 'google', redirectUri: 'https://app/callback' });
  const nonce = new URL(start.authorizationUrl).searchParams.get('state');
  const completed = await app.completeAuthorization({ nonce, code: 'authorization-code' });
  assert.equal(completed.account.email, 'ryan@example.com');
  assert.equal(completed.account.tokenEnvelope, undefined);
  const stored = [...h.accounts.values()][0];
  assert.ok(stored.tokenEnvelope.ciphertext);
  assert.equal(JSON.stringify(stored).includes('refresh'), false);
  await assert.rejects(() => app.completeAuthorization({ nonce, code: 'replay' }), /already-consumed/);
  assert.equal(calls.length, 2);
});

test('expired access token refreshes under lock and preserves rotated token set', async () => {
  const h = harness();
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) return response(200, { access_token: 'initial', refresh_token: 'refresh-1', expires_in: 1, scope: 'openid email' });
    return response(200, { sub: 'sub', email: 'a@example.com' });
  };
  const app = service(h, fetchImpl);
  const start = await app.startAuthorization({ userId: 'user-1', provider: 'google', redirectUri: 'https://app/callback' });
  const nonce = new URL(start.authorizationUrl).searchParams.get('state');
  const { account } = await app.completeAuthorization({ nonce, code: 'code' });
  h.now += 5_000;
  app.fetchImpl = async () => response(200, { access_token: 'refreshed', refresh_token: 'refresh-2', expires_in: 3600, scope: 'openid email' });
  assert.equal(await app.getValidAccessToken({ userId: 'user-1', accountId: account.id }), 'refreshed');
  assert.equal(h.accounts.get(account.id).status, 'connected');
  assert.equal(h.audits.at(-1).action, 'oauth.token_refreshed');
});

test('nonretryable refresh error transitions account to reauthorization required', async () => {
  const h = harness();
  const setupFetch = async (url) => String(url).includes('/token')
    ? response(200, { access_token: 'initial', refresh_token: 'refresh', expires_in: 1, scope: 'openid email' })
    : response(200, { sub: 'sub', email: 'a@example.com' });
  const app = service(h, setupFetch);
  const start = await app.startAuthorization({ userId: 'user-1', provider: 'google', redirectUri: 'https://app/callback' });
  const nonce = new URL(start.authorizationUrl).searchParams.get('state');
  const { account } = await app.completeAuthorization({ nonce, code: 'code' });
  h.now += 5_000;
  app.fetchImpl = async () => response(400, { error: 'invalid_grant', error_description: 'revoked' });
  await assert.rejects(() => app.getValidAccessToken({ userId: 'user-1', accountId: account.id }), /revoked/);
  assert.equal(h.accounts.get(account.id).status, 'reauthorization_required');
});
