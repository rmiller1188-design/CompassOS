import { OAuthApplicationService } from '../oauth/application.js';
import { createM26OAuthStores, createProcessLockStore } from './m26-oauth-stores.js';

function required(value, name) {
  if (!value || typeof value !== 'string') throw new TypeError(`${name} is required`);
  return value;
}

function providerCredentials(env) {
  return {
    google: {
      clientId: required(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'),
      clientSecret: required(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET'),
    },
    microsoft: {
      clientId: required(env.MICROSOFT_CLIENT_ID, 'MICROSOFT_CLIENT_ID'),
      clientSecret: required(env.MICROSOFT_CLIENT_SECRET, 'MICROSOFT_CLIENT_SECRET'),
    },
  };
}

export function getProviderRedirectUri(provider, env) {
  if (provider === 'google') return required(env.GOOGLE_REDIRECT_URI, 'GOOGLE_REDIRECT_URI');
  if (provider === 'microsoft') return required(env.MICROSOFT_REDIRECT_URI, 'MICROSOFT_REDIRECT_URI');
  throw new TypeError('Unsupported provider');
}

export function createOAuthLinkingService({ env = process.env, fetchImpl = fetch } = {}) {
  const stores = createM26OAuthStores({
    supabaseUrl: required(env.SUPABASE_URL, 'SUPABASE_URL'),
    serviceRoleKey: required(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    fetchImpl,
  });
  return new OAuthApplicationService({
    ...stores,
    lockStore: createProcessLockStore(),
    encryptionKey: required(env.TOKEN_ENVELOPE_KEY, 'TOKEN_ENVELOPE_KEY'),
    providerCredentials: providerCredentials(env),
    fetchImpl,
  });
}
