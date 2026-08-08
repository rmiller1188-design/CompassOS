function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

export function createContainedProviderSession({ provider, accountId, accessToken }) {
  const boundProvider = requireString(provider, 'Provider');
  const boundAccountId = requireString(accountId, 'Account id');
  const token = requireString(accessToken, 'Provider access token');

  const session = {};
  Object.defineProperties(session, {
    provider: {
      value: boundProvider,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    accountId: {
      value: boundAccountId,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    accessToken: {
      get() { return token; },
      enumerable: false,
      configurable: false,
    },
    withAccessToken: {
      value: async (callback) => {
        if (typeof callback !== 'function') throw new TypeError('Provider token callback is required');
        return callback(token);
      },
      enumerable: false,
      writable: false,
      configurable: false,
    },
    toJSON: {
      value: () => ({ provider: boundProvider, accountId: boundAccountId, credential: 'ephemeral' }),
      enumerable: false,
      writable: false,
      configurable: false,
    },
  });

  return Object.freeze(session);
}

export function assertContainedProviderSession(session, { provider, accountId } = {}) {
  if (!session || typeof session !== 'object') throw new TypeError('Provider session is required');
  const actualProvider = requireString(session.provider, 'Provider');
  const actualAccountId = requireString(session.accountId, 'Account id');
  if (provider !== undefined && actualProvider !== requireString(provider, 'Expected provider')) throw new Error('Provider session provider mismatch');
  if (accountId !== undefined && actualAccountId !== requireString(accountId, 'Expected account id')) throw new Error('Provider session account mismatch');
  if (typeof session.withAccessToken !== 'function') throw new Error('Contained provider credential capability is required');
  return session;
}
