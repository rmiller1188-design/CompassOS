import { createPkcePair, createOAuthState, verifyOAuthState, buildReadOnlyScopes } from '../security/oauth.js';
import { encryptTokenPayload, decryptTokenPayload } from '../security/token-envelope.js';
import { buildAuthorizationUrl, exchangeAuthorizationCode, fetchProviderIdentity, refreshAccessToken, revokeProviderToken, shouldRefreshToken } from './runtime.js';

function required(value, name) {
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

export class OAuthApplicationService {
  constructor({ stateStore, accountStore, auditStore, lockStore, encryptionKey, providerCredentials, fetchImpl = fetch, now = () => Date.now() }) {
    this.stateStore = required(stateStore, 'stateStore');
    this.accountStore = required(accountStore, 'accountStore');
    this.auditStore = required(auditStore, 'auditStore');
    this.lockStore = required(lockStore, 'lockStore');
    this.encryptionKey = required(encryptionKey, 'encryptionKey');
    this.providerCredentials = required(providerCredentials, 'providerCredentials');
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  async startAuthorization({ userId, provider, redirectUri, redirectTo = '/', features = { mail: true }, loginHint }) {
    const credentials = required(this.providerCredentials[provider], `credentials for ${provider}`);
    const pkce = createPkcePair();
    const state = createOAuthState({ userId, provider, redirectTo, now: this.now() });
    const verifierEnvelope = encryptTokenPayload({ verifier: pkce.verifier }, this.encryptionKey, { purpose: 'oauth-pkce', userId, provider });
    await this.stateStore.create({ ...state, verifierEnvelope, redirectUri, createdAt: new Date(this.now()).toISOString() });
    await this.auditStore.append({ userId, action: 'oauth.authorization_started', provider, metadata: { redirectTo, features } });
    return {
      authorizationUrl: buildAuthorizationUrl({ provider, clientId: credentials.clientId, redirectUri, scopes: buildReadOnlyScopes(provider, features), state: state.nonce, codeChallenge: pkce.challenge, loginHint }),
      expiresAt: state.expiresAt,
    };
  }

  async completeAuthorization({ nonce, code }) {
    const stored = await this.stateStore.consume(nonce);
    if (!stored || !verifyOAuthState({ nonce, storedNonceHash: stored.nonceHash, expiresAt: stored.expiresAt, now: this.now() })) {
      throw new Error('Invalid, expired, or already-consumed OAuth state');
    }
    const credentials = required(this.providerCredentials[stored.provider], `credentials for ${stored.provider}`);
    const { verifier } = decryptTokenPayload(stored.verifierEnvelope, this.encryptionKey);
    const tokenSet = await exchangeAuthorizationCode({ provider: stored.provider, clientId: credentials.clientId, clientSecret: credentials.clientSecret, redirectUri: stored.redirectUri, code, codeVerifier: verifier, fetchImpl: this.fetchImpl, now: this.now() });
    const identity = await fetchProviderIdentity({ provider: stored.provider, accessToken: tokenSet.accessToken, fetchImpl: this.fetchImpl });
    const tokenEnvelope = encryptTokenPayload(tokenSet, this.encryptionKey, { purpose: 'provider-token', userId: stored.userId, provider: stored.provider, providerSubject: identity.providerSubject });
    const account = await this.accountStore.upsert({ userId: stored.userId, provider: stored.provider, providerSubject: identity.providerSubject, email: identity.email, displayName: identity.displayName, status: 'connected', scopes: tokenSet.scope, expiresAt: tokenSet.expiresAt, tokenEnvelope });
    await this.auditStore.append({ userId: stored.userId, action: 'oauth.account_connected', provider: stored.provider, accountId: account.id, metadata: { email: identity.email, scopes: tokenSet.scope } });
    return { account: { ...account, tokenEnvelope: undefined }, redirectTo: stored.redirectTo };
  }

  async getValidAccessToken({ userId, accountId }) {
    return this.lockStore.withLock(`oauth-refresh:${accountId}`, async () => {
      const account = await this.accountStore.getOwned(userId, accountId);
      if (!account || account.status === 'disconnected') throw new Error('Connected account not found');
      let tokenSet = decryptTokenPayload(account.tokenEnvelope, this.encryptionKey);
      if (!shouldRefreshToken(tokenSet, { now: this.now() })) return tokenSet.accessToken;
      if (!tokenSet.refreshToken) {
        await this.accountStore.updateStatus(accountId, 'reauthorization_required');
        throw new Error('Reauthorization required: no refresh token');
      }
      const credentials = required(this.providerCredentials[account.provider], `credentials for ${account.provider}`);
      try {
        tokenSet = await refreshAccessToken({ provider: account.provider, clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: tokenSet.refreshToken, scopes: account.scopes, fetchImpl: this.fetchImpl, now: this.now() });
      } catch (error) {
        if (!error.retryable) await this.accountStore.updateStatus(accountId, 'reauthorization_required');
        throw error;
      }
      const tokenEnvelope = encryptTokenPayload(tokenSet, this.encryptionKey, { purpose: 'provider-token', userId, provider: account.provider, providerSubject: account.providerSubject });
      await this.accountStore.updateTokens(accountId, { tokenEnvelope, expiresAt: tokenSet.expiresAt, scopes: tokenSet.scope, status: 'connected' });
      await this.auditStore.append({ userId, action: 'oauth.token_refreshed', provider: account.provider, accountId, metadata: { expiresAt: tokenSet.expiresAt } });
      return tokenSet.accessToken;
    });
  }

  async disconnect({ userId, accountId }) {
    const account = await this.accountStore.getOwned(userId, accountId);
    if (!account) throw new Error('Connected account not found');
    const tokenSet = decryptTokenPayload(account.tokenEnvelope, this.encryptionKey);
    let providerRevoked = false;
    if (tokenSet.refreshToken || tokenSet.accessToken) {
      const result = await revokeProviderToken({ provider: account.provider, token: tokenSet.refreshToken || tokenSet.accessToken, fetchImpl: this.fetchImpl });
      providerRevoked = result.revoked;
    }
    await this.accountStore.disconnect(accountId);
    await this.auditStore.append({ userId, action: 'oauth.account_disconnected', provider: account.provider, accountId, metadata: { providerRevoked } });
    return { disconnected: true, providerRevoked };
  }
}
