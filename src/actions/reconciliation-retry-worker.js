import { createHash } from 'node:crypto';
import { classifyReconciliationProviderSessionError } from './reconciliation-provider-session.js';

const DEFAULT_BASE_DELAY_MS = 5_000;
const DEFAULT_MAX_DELAY_MS = 15 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function isoDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid date`);
  return date.toISOString();
}

function deterministicUnitInterval(seed) {
  const digest = createHash('sha256').update(seed, 'utf8').digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

export function computeReconciliationRetryPlan({
  actionId,
  attempt,
  retryAfterMs = null,
  now = new Date(),
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
}) {
  const id = requireString(actionId, 'Action id');
  requirePositiveInteger(attempt, 'Attempt');
  requirePositiveInteger(baseDelayMs, 'Base delay');
  requirePositiveInteger(maxDelayMs, 'Maximum delay');
  if (baseDelayMs > maxDelayMs) throw new RangeError('Base delay cannot exceed maximum delay');
  if (retryAfterMs !== null && (!Number.isFinite(retryAfterMs) || retryAfterMs < 0)) throw new TypeError('Retry-After must be a non-negative number');

  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** Math.min(attempt - 1, 20)));
  const jitterFloor = Math.max(baseDelayMs, Math.floor(exponential * 0.5));
  const jitterSpan = Math.max(0, exponential - jitterFloor);
  const jitter = Math.floor(deterministicUnitInterval(`${id}:${attempt}`) * jitterSpan);
  const computedDelayMs = Math.min(maxDelayMs, jitterFloor + jitter);
  const providerDelayMs = retryAfterMs === null ? 0 : Math.min(maxDelayMs, Math.ceil(retryAfterMs));
  const delayMs = Math.max(computedDelayMs, providerDelayMs);
  const scheduledAt = new Date(new Date(now).getTime() + delayMs);
  if (Number.isNaN(scheduledAt.getTime())) throw new TypeError('Current time must be valid');

  return Object.freeze({
    attempt,
    delayMs,
    providerDelayMs,
    scheduledAt: scheduledAt.toISOString(),
  });
}

export function createSupabaseReconciliationRetryStore({ client }) {
  if (!client?.rpc || !client?.from) throw new TypeError('Supabase service client is required');
  const unwrap = (result, label) => {
    if (result?.error) throw new Error(`${label}: ${result.error.message || 'Supabase operation failed'}`);
    return result?.data ?? null;
  };

  return {
    async claim({ workerId, leaseSeconds = 60 }) {
      requireString(workerId, 'Worker id');
      requirePositiveInteger(leaseSeconds, 'Lease seconds');
      return unwrap(await client.rpc('claim_outbound_reconciliation', {
        p_worker_id: workerId,
        p_lease_seconds: leaseSeconds,
      }), 'claim reconciliation');
    },

    async scheduleRetry({ actionId, leaseToken, nextAttemptAt, errorCode }) {
      return unwrap(await client.rpc('schedule_outbound_reconciliation_retry', {
        p_action_id: requireString(actionId, 'Action id'),
        p_lease_token: requireString(leaseToken, 'Lease token'),
        p_next_attempt_at: isoDate(nextAttemptAt, 'Next attempt'),
        p_error_code: requireString(errorCode, 'Error code'),
      }), 'schedule reconciliation retry');
    },

    async release({ actionId, leaseToken }) {
      return unwrap(await client.rpc('release_outbound_reconciliation_lease', {
        p_action_id: requireString(actionId, 'Action id'),
        p_lease_token: requireString(leaseToken, 'Lease token'),
      }), 'release reconciliation lease');
    },

    async exhaust({ actionId, leaseToken, resolutionCode = 'PROVIDER_LOOKUP_RETRY_EXHAUSTED' }) {
      return unwrap(await client.rpc('exhaust_outbound_reconciliation_retry', {
        p_action_id: requireString(actionId, 'Action id'),
        p_lease_token: requireString(leaseToken, 'Lease token'),
        p_resolution_code: requireString(resolutionCode, 'Resolution code'),
      }), 'exhaust reconciliation retry');
    },
  };
}

function normalizeClaim(row) {
  if (!row) return null;
  const value = Array.isArray(row) ? row[0] : row;
  if (!value) return null;
  return {
    actionId: requireString(value.action_id ?? value.actionId, 'Claim action id'),
    leaseToken: requireString(value.lease_token ?? value.leaseToken, 'Claim lease token'),
    attempt: requirePositiveInteger(Number(value.attempt_count ?? value.attempt ?? 1), 'Claim attempt'),
    row: value,
  };
}

async function scheduleClassifiedRetry({ claim, classification, retryStore, maxAttempts, now, retryPolicy }) {
  if (claim.attempt >= maxAttempts) {
    await retryStore.exhaust({ actionId: claim.actionId, leaseToken: claim.leaseToken });
    return Object.freeze({ disposition: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_RETRY_EXHAUSTED', actionId: claim.actionId, attempt: claim.attempt });
  }
  const plan = computeReconciliationRetryPlan({
    actionId: claim.actionId,
    attempt: claim.attempt,
    retryAfterMs: classification.retryAfterMs ?? null,
    now: now(),
    ...retryPolicy,
  });
  await retryStore.scheduleRetry({
    actionId: claim.actionId,
    leaseToken: claim.leaseToken,
    nextAttemptAt: plan.scheduledAt,
    errorCode: classification.resolutionCode || 'PROVIDER_LOOKUP_TRANSIENT',
  });
  return Object.freeze({
    disposition: 'retry_scheduled',
    resolutionCode: classification.resolutionCode || 'PROVIDER_LOOKUP_TRANSIENT',
    actionId: claim.actionId,
    attempt: claim.attempt,
    retry: plan,
  });
}

export async function runReconciliationRetryWorkerOnce({
  workerId,
  retryStore,
  hydrate,
  prepareProviderSession = null,
  orchestrate,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  leaseSeconds = 60,
  now = () => new Date(),
  retryPolicy = {},
}) {
  requireString(workerId, 'Worker id');
  requirePositiveInteger(maxAttempts, 'Maximum attempts');
  if (!retryStore?.claim || !retryStore?.scheduleRetry || !retryStore?.release || !retryStore?.exhaust) {
    throw new TypeError('Reconciliation retry store is incomplete');
  }
  if (typeof hydrate !== 'function') throw new TypeError('Reconciliation hydrator is required');
  if (prepareProviderSession !== null && typeof prepareProviderSession !== 'function') throw new TypeError('Provider session preparer must be a function');
  if (typeof orchestrate !== 'function') throw new TypeError('Reconciliation orchestrator is required');

  const claim = normalizeClaim(await retryStore.claim({ workerId, leaseSeconds }));
  if (!claim) return Object.freeze({ disposition: 'idle' });

  if (claim.attempt > maxAttempts) {
    await retryStore.exhaust({ actionId: claim.actionId, leaseToken: claim.leaseToken });
    return Object.freeze({ disposition: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_RETRY_EXHAUSTED', actionId: claim.actionId, attempt: claim.attempt });
  }

  let context;
  try {
    context = await hydrate({ actionId: claim.actionId, claim: claim.row });
    if (!context?.reconciliation || context.reconciliation.actionId !== claim.actionId) throw new Error('Hydrated reconciliation does not match claimed action');
    if (context.reconciliation.status !== 'pending') throw new Error('Claimed reconciliation is no longer pending');
  } catch (error) {
    await retryStore.exhaust({ actionId: claim.actionId, leaseToken: claim.leaseToken, resolutionCode: 'RECONCILIATION_CONTEXT_INVALID' });
    return Object.freeze({ disposition: 'manual_review', resolutionCode: 'RECONCILIATION_CONTEXT_INVALID', actionId: claim.actionId, attempt: claim.attempt, error: error?.message || 'Context hydration failed' });
  }

  if (prepareProviderSession) {
    try {
      context = await prepareProviderSession(context);
    } catch (error) {
      const classification = classifyReconciliationProviderSessionError(error);
      if (classification.disposition === 'retry_later') {
        return scheduleClassifiedRetry({ claim, classification, retryStore, maxAttempts, now, retryPolicy });
      }
      await retryStore.exhaust({ actionId: claim.actionId, leaseToken: claim.leaseToken, resolutionCode: classification.resolutionCode });
      return Object.freeze({ disposition: 'manual_review', resolutionCode: classification.resolutionCode, actionId: claim.actionId, attempt: claim.attempt });
    }
  }

  let result;
  try {
    result = await orchestrate(context);
  } catch (error) {
    await retryStore.exhaust({ actionId: claim.actionId, leaseToken: claim.leaseToken, resolutionCode: 'RECONCILIATION_ORCHESTRATION_FAILED' });
    return Object.freeze({ disposition: 'manual_review', resolutionCode: 'RECONCILIATION_ORCHESTRATION_FAILED', actionId: claim.actionId, attempt: claim.attempt, error: error?.message || 'Reconciliation orchestration failed' });
  }

  if (result?.disposition === 'retry_later') {
    return scheduleClassifiedRetry({ claim, classification: result, retryStore, maxAttempts, now, retryPolicy });
  }

  await retryStore.release({ actionId: claim.actionId, leaseToken: claim.leaseToken });
  return Object.freeze({ ...result, actionId: claim.actionId, attempt: claim.attempt });
}
