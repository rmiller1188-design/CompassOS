import { createHash } from 'node:crypto';

const AMBIGUOUS_NETWORK_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
  'PROVIDER_OUTCOME_UNKNOWN',
  'PROVIDER_SUCCEEDED_RECEIPT_PERSISTENCE_FAILED',
]);

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function isoDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid date`);
  return date.toISOString();
}

export function hashIdempotencyKey(value) {
  return createHash('sha256').update(requireString(value, 'Idempotency key'), 'utf8').digest('hex');
}

export function isAmbiguousProviderOutcome(error) {
  if (!error) return false;
  if (error.ambiguousOutcome === true) return true;
  if (AMBIGUOUS_NETWORK_CODES.has(error.code)) return true;
  const status = Number(error.status || error.statusCode || 0);
  if (error.requestSent === true && status >= 500 && status <= 599) return true;
  return false;
}

export function buildReconciliationCase({ action, lease, error, receipt = null, policyDecision = null, now = new Date() }) {
  if (!action?.id || !action?.userId || !action?.providerAccountId) throw new TypeError('Outbound action identity is required');
  if (!lease?.workerId) throw new TypeError('Execution lease worker is required');
  if (!isAmbiguousProviderOutcome(error)) throw new Error('Only ambiguous provider outcomes may enter reconciliation');
  const reasonCode = requireString(error.code || 'PROVIDER_OUTCOME_UNKNOWN', 'Reconciliation reason');
  return {
    actionId: action.id,
    userId: action.userId,
    accountId: action.providerAccountId,
    provider: requireString(action.provider, 'Provider'),
    actionType: requireString(action.actionType, 'Action type'),
    idempotencyKeyHash: hashIdempotencyKey(action.idempotencyKey),
    payloadHash: requireString(action.payloadHash, 'Payload hash'),
    payloadRevision: action.payloadRevision,
    approvalRevision: action.approvalRevision,
    workerId: lease.workerId,
    reasonCode,
    providerReceiptId: receipt?.providerMessageId || receipt?.providerEventId || receipt?.id || null,
    policyDecisionHash: policyDecision?.decisionHash || null,
    observedAt: isoDate(now, 'Observed time'),
    status: 'pending',
  };
}

export function createSupabaseReconciliationStore({ client, now = () => new Date() }) {
  if (!client?.from) throw new TypeError('Supabase service client is required');

  function assertResult(result, operation) {
    if (result?.error) {
      const error = new Error(`${operation}: ${result.error.message || 'Supabase operation failed'}`);
      error.code = result.error.code;
      throw error;
    }
    return result?.data;
  }

  return {
    async record(reconciliation) {
      const row = {
        action_id: reconciliation.actionId,
        user_id: reconciliation.userId,
        account_id: reconciliation.accountId,
        provider: reconciliation.provider,
        action_type: reconciliation.actionType,
        idempotency_key_hash: reconciliation.idempotencyKeyHash,
        payload_hash: reconciliation.payloadHash,
        payload_revision: reconciliation.payloadRevision,
        approval_revision: reconciliation.approvalRevision,
        worker_id: reconciliation.workerId,
        reason_code: reconciliation.reasonCode,
        provider_receipt_id: reconciliation.providerReceiptId,
        policy_decision_hash: reconciliation.policyDecisionHash,
        observed_at: reconciliation.observedAt,
        status: reconciliation.status,
        updated_at: now().toISOString(),
      };
      return assertResult(await client.from('outbound_action_reconciliations').upsert(row, { onConflict: 'action_id', ignoreDuplicates: false }).select('*').single(), 'record outbound reconciliation');
    },

    async resolve({ actionId, status, providerReceiptId = null, resolutionCode, expectedUpdatedAt = null }) {
      requireString(actionId, 'Action id');
      if (!['resolved_succeeded', 'resolved_failed', 'manual_review'].includes(status)) throw new Error('Invalid reconciliation resolution status');
      const patch = {
        status,
        resolution_code: requireString(resolutionCode, 'Resolution code'),
        provider_receipt_id: providerReceiptId,
        resolved_at: now().toISOString(),
        updated_at: now().toISOString(),
      };
      let query = client.from('outbound_action_reconciliations').update(patch).eq('action_id', actionId).eq('status', 'pending');
      if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
      const row = assertResult(await query.select('*').maybeSingle(), 'resolve outbound reconciliation');
      if (!row) throw new Error('Reconciliation case changed or is no longer pending');
      return row;
    },
  };
}

export async function reconcileProviderOutcome({ reconciliation, lookupProviderOutcome, existingReceipt = null }) {
  if (!reconciliation || reconciliation.status !== 'pending') throw new Error('Pending reconciliation case is required');
  if (existingReceipt) {
    return {
      status: 'resolved_succeeded',
      resolutionCode: 'LOCAL_RECEIPT_FOUND',
      receipt: existingReceipt,
    };
  }
  if (typeof lookupProviderOutcome !== 'function') {
    return { status: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_UNAVAILABLE', receipt: null };
  }
  const outcome = await lookupProviderOutcome(reconciliation);
  if (!outcome || outcome.status === 'unknown') return { status: 'manual_review', resolutionCode: 'PROVIDER_OUTCOME_STILL_UNKNOWN', receipt: null };
  if (outcome.status === 'succeeded') {
    if (!outcome.receipt) throw new Error('Successful provider reconciliation must include a receipt');
    return { status: 'resolved_succeeded', resolutionCode: 'PROVIDER_CONFIRMED_SUCCESS', receipt: outcome.receipt };
  }
  if (outcome.status === 'not_found') return { status: 'resolved_failed', resolutionCode: 'PROVIDER_CONFIRMED_NOT_FOUND', receipt: null };
  throw new Error('Unsupported provider reconciliation outcome');
}
