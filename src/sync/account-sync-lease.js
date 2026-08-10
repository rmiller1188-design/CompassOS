const DEFAULT_LEASE_DURATION_MS = 120_000;
const MIN_LEASE_DURATION_MS = 5_000;
const MAX_LEASE_DURATION_MS = 15 * 60_000;

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function validateLeaseDuration(leaseDurationMs) {
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < MIN_LEASE_DURATION_MS || leaseDurationMs > MAX_LEASE_DURATION_MS) {
    throw new RangeError(`leaseDurationMs must be between ${MIN_LEASE_DURATION_MS} and ${MAX_LEASE_DURATION_MS}`);
  }
  return leaseDurationMs;
}

function assertAccount(account) {
  if (!account?.id || !account?.provider) throw new TypeError('Connected account id and provider are required');
}

function createLeaseControlError(code, message, { retryAfterMs = 5_000 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = true;
  error.retryAfterMs = retryAfterMs;
  return error;
}

function assertRpcResult(result, operation) {
  if (result?.error) {
    throw createLeaseControlError('SYNC_LEASE_BACKEND', `Account sync lease ${operation} failed`);
  }
  return result?.data;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function mapLease(row) {
  if (!row) return null;
  return Object.freeze({
    accountId: row.account_id,
    provider: row.provider,
    workerId: row.lease_owner,
    leaseToken: row.lease_token,
    leasedAt: row.lease_started_at,
    leaseExpiresAt: row.lease_expires_at,
  });
}

export function assertAccountSyncLease(lease, account, { workerId = null, now = new Date() } = {}) {
  assertAccount(account);
  if (!lease?.accountId || !lease?.provider || !lease?.workerId || !lease?.leaseToken || !lease?.leaseExpiresAt) {
    throw new TypeError('Complete account sync lease is required');
  }
  if (lease.accountId !== account.id || lease.provider !== account.provider) throw new Error('Account sync lease scope mismatch');
  if (workerId != null && lease.workerId !== workerId) throw new Error('Account sync lease belongs to another worker');
  const expiry = new Date(lease.leaseExpiresAt);
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(expiry.getTime()) || Number.isNaN(reference.getTime())) throw new TypeError('Account sync lease timestamps must be valid');
  if (expiry <= reference) throw new Error('Account sync lease expired');
  return true;
}

export function createSupabaseAccountSyncLeaseManager({ client, workerId, leaseDurationMs = DEFAULT_LEASE_DURATION_MS, now = () => new Date() } = {}) {
  if (!client?.rpc) throw new TypeError('Supabase service client with rpc() is required');
  const boundWorkerId = requireText(workerId, 'Worker id');
  const durationMs = validateLeaseDuration(leaseDurationMs);

  return Object.freeze({
    async acquire(account) {
      assertAccount(account);
      const data = assertRpcResult(await client.rpc('claim_account_sync_lease', {
        p_account_id: account.id,
        p_provider: account.provider,
        p_worker_id: boundWorkerId,
        p_lease_seconds: Math.ceil(durationMs / 1000),
      }), 'claim');
      const lease = mapLease(firstRow(data));
      if (!lease) return null;
      assertAccountSyncLease(lease, account, { workerId: boundWorkerId, now: now() });
      return lease;
    },

    async heartbeat(lease, account) {
      try {
        assertAccountSyncLease(lease, account, { workerId: boundWorkerId, now: now() });
      } catch {
        throw createLeaseControlError('SYNC_LEASE_LOST', 'Account sync lease lost or expired');
      }
      const data = assertRpcResult(await client.rpc('heartbeat_account_sync_lease', {
        p_account_id: account.id,
        p_worker_id: boundWorkerId,
        p_lease_token: lease.leaseToken,
        p_lease_seconds: Math.ceil(durationMs / 1000),
      }), 'heartbeat');
      const refreshed = mapLease(firstRow(data));
      if (!refreshed) throw createLeaseControlError('SYNC_LEASE_LOST', 'Account sync lease lost or expired');
      try {
        assertAccountSyncLease(refreshed, account, { workerId: boundWorkerId, now: now() });
      } catch {
        throw createLeaseControlError('SYNC_LEASE_LOST', 'Account sync lease lost or expired');
      }
      return refreshed;
    },

    async release(lease, account) {
      assertAccount(account);
      if (!lease?.leaseToken || lease.accountId !== account.id || lease.provider !== account.provider || lease.workerId !== boundWorkerId) {
        throw new Error('Account sync lease release scope mismatch');
      }
      const data = assertRpcResult(await client.rpc('release_account_sync_lease', {
        p_account_id: account.id,
        p_worker_id: boundWorkerId,
        p_lease_token: lease.leaseToken,
      }), 'release');
      return data === true || firstRow(data)?.released === true;
    },

    getPolicy() {
      return Object.freeze({
        workerId: boundWorkerId,
        leaseDurationMs: durationMs,
        minLeaseDurationMs: MIN_LEASE_DURATION_MS,
        maxLeaseDurationMs: MAX_LEASE_DURATION_MS,
      });
    },
  });
}

export function getAccountSyncLeasePolicy() {
  return Object.freeze({
    defaultLeaseDurationMs: DEFAULT_LEASE_DURATION_MS,
    minLeaseDurationMs: MIN_LEASE_DURATION_MS,
    maxLeaseDurationMs: MAX_LEASE_DURATION_MS,
    ownership: 'account_provider_worker_token',
    browserAuthority: 'none',
  });
}
