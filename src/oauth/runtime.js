import { getProviderConfig } from './provider-config.js';

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class OAuthProviderError extends Error {
  constructor(message, { provider, status = 0, code = 'oauth_error', retryable = false, details = null } = {}) {
    super(message);
    this.name = 'OAuthProviderError';
    this.provider = provider;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function required(value, name) {
  if (!value || typeof value !== 'string') throw new TypeError(`${name} is required`);
  return value;
}

function formBody(values) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') form.set(key, String(value));
  }
  return form;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

function classifyProviderError(provider, response, payload) {
  const code = payload.error || payload.code || `http_${response.status}`;
  const description = payload.error_description || payload.message || payload.raw || 'OAuth provider request failed';
  return new OAuthProviderError(description, {
    provider,
    status: response.status,
    code,
    retryable: TRANSIENT_STATUSES.has(response.status),
    details: { errorUri: payload.error_uri || null },
  });
}

export function buildAuthorizationUrl({ provider, clientId, redirectUri, scopes, state, codeChallenge, loginHint }) {
  const config = getProviderConfig(provider);
  const url = new URL(config.authorizationEndpoint);
  const params = {
    client_id: required(clientId, 'clientId'),
    redirect_uri: required(redirectUri, 'redirectUri'),
    response_type: 'code',
    scope: required(scopes?.join(' '), 'scopes'),
    state: required(state, 'state'),
    code_challenge: required(codeChallenge, 'codeChallenge'),
    code_challenge_method: 'S256',
    login_hint: loginHint,
    ...config.extraAuthorizationParams,
  };
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

export async function exchangeAuthorizationCode({ provider, clientId, clientSecret, redirectUri, code, codeVerifier, fetchImpl = fetch, now = Date.now() }) {
  const config = getProviderConfig(provider);
  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: formBody({ client_id: required(clientId, 'clientId'), client_secret: clientSecret, redirect_uri: required(redirectUri, 'redirectUri'), code: required(code, 'code'), code_verifier: required(codeVerifier, 'codeVerifier'), grant_type: 'authorization_code' }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw classifyProviderError(provider, response, payload);
  return normalizeTokenSet(provider, payload, { now });
}

export async function refreshAccessToken({ provider, clientId, clientSecret, refreshToken, scopes, fetchImpl = fetch, now = Date.now() }) {
  const config = getProviderConfig(provider);
  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: formBody({ client_id: required(clientId, 'clientId'), client_secret: clientSecret, refresh_token: required(refreshToken, 'refreshToken'), grant_type: 'refresh_token', scope: scopes?.join(' ') }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw classifyProviderError(provider, response, payload);
  return normalizeTokenSet(provider, payload, { fallbackRefreshToken: refreshToken, now });
}

export async function fetchProviderIdentity({ provider, accessToken, fetchImpl = fetch }) {
  const config = getProviderConfig(provider);
  const response = await fetchImpl(config.userInfoEndpoint, { headers: { authorization: `Bearer ${required(accessToken, 'accessToken')}`, accept: 'application/json' } });
  const payload = await parseResponse(response);
  if (!response.ok) throw classifyProviderError(provider, response, payload);
  if (provider === 'google') return { providerSubject: required(payload.sub, 'provider subject'), email: required(payload.email, 'email'), displayName: payload.name || null };
  return { providerSubject: required(payload.id, 'provider subject'), email: required(payload.mail || payload.userPrincipalName, 'email'), displayName: payload.displayName || null };
}

export async function revokeProviderToken({ provider, token, fetchImpl = fetch }) {
  const config = getProviderConfig(provider);
  if (!config.revokeEndpoint) return { revoked: false, reason: 'provider_has_no_standard_revoke_endpoint' };
  const response = await fetchImpl(config.revokeEndpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: formBody({ token: required(token, 'token') }),
  });
  if (!response.ok) throw classifyProviderError(provider, response, await parseResponse(response));
  return { revoked: true };
}

export function normalizeTokenSet(provider, payload, { fallbackRefreshToken = null, now = Date.now() } = {}) {
  const accessToken = required(payload.access_token, 'access_token');
  const expiresIn = Number(payload.expires_in || 3600);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new TypeError('expires_in must be a positive number');
  return {
    provider, accessToken, refreshToken: payload.refresh_token || fallbackRefreshToken, tokenType: payload.token_type || 'Bearer',
    scope: typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [], idToken: payload.id_token || null,
    expiresAt: new Date(now + expiresIn * 1000).toISOString(), receivedAt: new Date(now).toISOString(),
  };
}

export function shouldRefreshToken(tokenSet, { now = Date.now(), skewSeconds = 120 } = {}) {
  const expiresAt = new Date(tokenSet?.expiresAt || 0).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now + skewSeconds * 1000;
}
