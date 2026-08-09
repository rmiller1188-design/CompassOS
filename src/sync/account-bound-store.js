const ACCOUNT_SCOPED_METHODS = Object.freeze([
  'getCursor',
  'saveCursor',
  'upsertMessages',
  'upsertEvents',
  'upsertContacts',
  'recordSync',
  'markReauthorizationRequired',
]);

function assertAccount(account) {
  if (!account?.id || !account?.provider) {
    throw new TypeError('Connected account id and provider are required for store binding');
  }
}

function assertAccountId(expectedAccountId, actualAccountId) {
  if (actualAccountId !== expectedAccountId) {
    throw new TypeError('Sync store account scope violation');
  }
}

export function bindSyncStoreToAccount({ store, account } = {}) {
  assertAccount(account);
  if (!store || (typeof store !== 'object' && typeof store !== 'function')) {
    throw new TypeError('Resolved sync store is required');
  }

  const scope = Object.freeze({ accountId: account.id, provider: account.provider });
  const bound = {
    getAccountScope() {
      return scope;
    },
  };

  for (const method of ACCOUNT_SCOPED_METHODS) {
    if (typeof store[method] !== 'function') continue;
    bound[method] = async (accountId, ...args) => {
      assertAccountId(account.id, accountId);
      return store[method](accountId, ...args);
    };
  }

  return Object.freeze(bound);
}

export function assertSyncStoreScope(store, account) {
  assertAccount(account);
  if (!store || typeof store.getAccountScope !== 'function') {
    throw new TypeError('Account-bound sync store is required');
  }
  const scope = store.getAccountScope();
  if (!scope || scope.accountId !== account.id || scope.provider !== account.provider) {
    throw new TypeError('Sync store binding does not match connected account');
  }
  return scope;
}

export function getAccountBoundSyncStorePolicy() {
  return Object.freeze({
    accountScopedMethods: ACCOUNT_SCOPED_METHODS,
    crossAccountCalls: 'deny',
  });
}
