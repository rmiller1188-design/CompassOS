function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function containsCredential(value, token, { depth = 0, seen = new WeakSet() } = {}) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.includes(token);
  if (typeof value !== 'object' && typeof value !== 'function') return false;
  if (depth >= 12) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (value instanceof Error) {
    return containsCredential(value.message, token, { depth: depth + 1, seen })
      || containsCredential(value.stack, token, { depth: depth + 1, seen })
      || containsCredential(value.cause, token, { depth: depth + 1, seen });
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsCredential(entry, token, { depth: depth + 1, seen }));
  }
  if (value instanceof Map) {
    for (const [key, entry] of value.entries()) {
      if (containsCredential(key, token, { depth: depth + 1, seen }) || containsCredential(entry, token, { depth: depth + 1, seen })) return true;
    }
    return false;
  }
  if (value instanceof Set) {
    for (const entry of value.values()) {
      if (containsCredential(entry, token, { depth: depth + 1, seen })) return true;
    }
    return false;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (containsCredential(key, token, { depth: depth + 1, seen }) || containsCredential(entry, token, { depth: depth + 1, seen })) return true;
  }
  return false;
}

function credentialEscapeError() {
  const error = new Error('Provider credential capability attempted to return secret material');
  error.code = 'PROVIDER_CREDENTIAL_ESCAPE_BLOCKED';
  return error;
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
    credentialMode: {
      value: 'capability-only',
      enumerable: true,
      writable: false,
      configurable: false,
    },
    withAccessToken: {
      value: async (callback) => {
        if (typeof callback !== 'function') throw new TypeError('Provider token callback is required');
        let result;
        try {
          result = await callback(token);
        } catch (error) {
          if (containsCredential(error, token)) throw credentialEscapeError();
          throw error;
        }
        if (containsCredential(result, token)) throw credentialEscapeError();
        return result;
      },
      enumerable: false,
      writable: false,
      configurable: false,
    },
    toJSON: {
      value: () => ({ provider: boundProvider, accountId: boundAccountId, credential: 'ephemeral', credentialMode: 'capability-only' }),
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
  if (session.credentialMode !== 'capability-only') throw new Error('Capability-only provider credential mode is required');
  if ('accessToken' in session) throw new Error('Ambient provider token access is forbidden');
  if (typeof session.withAccessToken !== 'function') throw new Error('Contained provider credential capability is required');
  return session;
}
