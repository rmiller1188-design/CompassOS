import { classifySyncError } from './mail-incremental.js';
import { runIncrementalMailSync } from './mail-incremental.js';
import { runIncrementalCalendarSync } from './calendar-incremental.js';
import { runIncrementalContactsSync } from './contacts-incremental.js';
import { bindSyncStoreToAccount, assertSyncStoreScope } from './account-bound-store.js';
import { assertAccountSyncLease } from './account-sync-lease.js';

const SUPPORTED_PROVIDERS = new Set(['google', 'microsoft']);
const SUPPORTED_RESOURCES = Object.freeze(['mail', 'calendar', 'contacts']);

function validateAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new TypeError('Connected accounts must be an array');
  const seen = new Set();
  return accounts.map((account) => {
    if (!account?.id || !account?.provider) throw new TypeError('Each connected account requires id and provider');
    if (!SUPPORTED_PROVIDERS.has(account.provider)) throw new TypeError(`Unsupported connected-account provider: ${account.provider}`);
    if (seen.has(account.id)) throw new TypeError(`Duplicate connected-account id: ${account.id}`);
    seen.add(account.id);
    return account;
  });
}

function validateResources(resources) {
  const requested = resources ?? SUPPORTED_RESOURCES;
  if (!Array.isArray(requested) || requested.length === 0) throw new TypeError('At least one sync resource is required');
  const unique = [];
  const seen = new Set();
  for (const resource of requested) {
    if (!SUPPORTED_RESOURCES.includes(resource)) throw new TypeError(`Unsupported sync resource: ${resource}`);
    if (!seen.has(resource)) {
      seen.add(resource);
      unique.push(resource);
    }
  }
  return unique;
}

function safeFailure(error) {
  const classified = classifySyncError(error);
  const explicitRetryable = error?.retryable === true;
  return Object.freeze({
    status: 'failed',
    retryable: Boolean(classified.retryable || explicitRetryable),
    reason: explicitRetryable && !classified.retryable ? 'sync_control_transient' : classified.reason,
    retryAfterMs: Number.isFinite(error?.retryAfterMs) && error.retryAfterMs >= 0
      ? Math.ceil(error.retryAfterMs)
      : Number.isFinite(classified.retryAfterMs) && classified.retryAfterMs >= 0
        ? Math.ceil(classified.retryAfterMs)
        : null,
  });
}

function createDefaultRunners() {
  return Object.freeze({ mail: runIncrementalMailSync, calendar: runIncrementalCalendarSync, contacts: runIncrementalContactsSync });
}

export function createUnifiedSyncCoordinator({
  resolveAdapter,
  resolveStore,
  resolveLeaseManager = null,
  requireAccountLease = false,
  runners = createDefaultRunners(),
} = {}) {
  if (typeof resolveAdapter !== 'function') throw new TypeError('resolveAdapter is required');
  if (typeof resolveStore !== 'function') throw new TypeError('resolveStore is required');
  if (resolveLeaseManager != null && typeof resolveLeaseManager !== 'function') throw new TypeError('resolveLeaseManager must be a function');
  if (requireAccountLease && typeof resolveLeaseManager !== 'function') throw new TypeError('Production scheduler requires resolveLeaseManager');
  for (const resource of SUPPORTED_RESOURCES) {
    if (typeof runners?.[resource] !== 'function') throw new TypeError(`Missing ${resource} sync runner`);
  }

  return async function runUnifiedSync({ accounts, resources, maxPages = 100, now = () => new Date() } = {}) {
    if (!Number.isInteger(maxPages) || maxPages <= 0) throw new TypeError('maxPages must be a positive integer');
    const connectedAccounts = validateAccounts(accounts);
    const requestedResources = validateResources(resources);
    const results = [];
    const resolvedStoreObjects = new WeakSet();

    for (const account of connectedAccounts) {
      if (account.status && account.status !== 'active') {
        results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: 'skipped', reason: 'account_inactive', resources: Object.freeze([]) }));
        continue;
      }

      const accountResults = [];
      let blockedForReauthorization = false;
      let adapter;
      try {
        adapter = await resolveAdapter(account);
        if (!adapter) throw new TypeError('Provider adapter resolution returned no adapter');
      } catch (error) {
        accountResults.push(Object.freeze({ resource: 'account', ...safeFailure(error) }));
        results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: 'failed', reason: 'adapter_resolution_failed', resources: Object.freeze(accountResults) }));
        continue;
      }

      let store;
      try {
        const resolvedStore = await resolveStore(account);
        if (!resolvedStore || (typeof resolvedStore !== 'object' && typeof resolvedStore !== 'function')) throw new TypeError('Sync store resolution returned no store');
        if (resolvedStoreObjects.has(resolvedStore)) throw new TypeError('Resolved sync store object cannot be reused across connected accounts');
        resolvedStoreObjects.add(resolvedStore);
        store = bindSyncStoreToAccount({ store: resolvedStore, account });
        assertSyncStoreScope(store, account);
      } catch (error) {
        accountResults.push(Object.freeze({ resource: 'account', ...safeFailure(error) }));
        results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: 'failed', reason: 'store_resolution_failed', resources: Object.freeze(accountResults) }));
        continue;
      }

      let leaseManager = null;
      let accountLease = null;
      if (resolveLeaseManager) {
        try {
          leaseManager = await resolveLeaseManager(account);
          if (!leaseManager || typeof leaseManager.acquire !== 'function' || typeof leaseManager.release !== 'function') {
            throw new TypeError('Account sync lease manager requires acquire and release');
          }
          accountLease = await leaseManager.acquire(account);
          if (!accountLease) {
            results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: 'skipped', reason: 'sync_already_running', resources: Object.freeze([]) }));
            continue;
          }
          assertAccountSyncLease(accountLease, account, { now: now() });
        } catch (error) {
          accountResults.push(Object.freeze({ resource: 'lease', ...safeFailure(error) }));
          results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: 'failed', reason: 'lease_acquisition_failed', resources: Object.freeze(accountResults) }));
          continue;
        }
      }

      try {
        for (const resource of requestedResources) {
          if (blockedForReauthorization) {
            accountResults.push(Object.freeze({ resource, status: 'skipped', retryable: false, reason: 'reauthorization_required', retryAfterMs: null }));
            continue;
          }
          try {
            assertSyncStoreScope(store, account);
            if (accountLease) assertAccountSyncLease(accountLease, account, { now: now() });
            const outcome = await runners[resource]({ account, adapter, store, maxPages, now, accountLease, leaseManager });
            accountResults.push(Object.freeze({ resource, status: outcome?.status || 'succeeded', retryable: false, reason: null, retryAfterMs: null, mode: outcome?.mode || null, pages: outcome?.pages ?? null, written: outcome?.written ?? null }));
          } catch (error) {
            const failure = safeFailure(error);
            accountResults.push(Object.freeze({ resource, ...failure }));
            if (failure.reason === 'reauthorization_required') blockedForReauthorization = true;
          }
        }
      } finally {
        if (accountLease) {
          try {
            await leaseManager.release(accountLease, account);
          } catch (error) {
            const failure = safeFailure(error);
            accountResults.push(Object.freeze({ resource: 'lease', ...failure, reason: 'lease_release_failed' }));
          }
        }
      }

      const failed = accountResults.some((item) => item.status === 'failed');
      const retryable = accountResults.some((item) => item.status === 'failed' && item.retryable);
      const requiresReauthorization = accountResults.some((item) => item.reason === 'reauthorization_required');
      results.push(Object.freeze({ accountId: account.id, provider: account.provider, status: failed ? 'failed' : 'succeeded', retryable, requiresReauthorization, resources: Object.freeze(accountResults) }));
    }

    return Object.freeze({
      status: results.some((item) => item.status === 'failed') ? 'partial_failure' : 'succeeded',
      accounts: Object.freeze(results),
      summary: Object.freeze({ total: results.length, succeeded: results.filter((item) => item.status === 'succeeded').length, failed: results.filter((item) => item.status === 'failed').length, skipped: results.filter((item) => item.status === 'skipped').length }),
    });
  };
}

export function getUnifiedSyncCoordinatorPolicy() {
  return Object.freeze({
    supportedProviders: Object.freeze([...SUPPORTED_PROVIDERS]),
    supportedResources: SUPPORTED_RESOURCES,
    storeIsolation: 'per_account',
    schedulerLeaseMode: 'require_account_lease',
  });
}
