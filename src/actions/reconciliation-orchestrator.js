import { createHash } from 'node:crypto';

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function isoDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid date`);
  return date.toISOString();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function hashObject(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function requirePending(reconciliation) {
  if (!reconciliation || reconciliation.status !== 'pending') throw new Error('Pending reconciliation case is required');
  for (const [key, label] of [
    ['actionId', 'Action id'],
    ['userId', 'User id'],
    ['accountId', 'Account id'],
    ['provider', 'Provider'],
    ['actionType', 'Action type'],
    ['payloadHash', 'Payload hash'],
    ['idempotencyKeyHash', 'Idempotency-key hash'],
  ]) requireString(reconciliation[key], label);
  return reconciliation;
}

function assertExactContext(reconciliation, action, account) {
  if (!action || action.id !== reconciliation.actionId || action.userId !== reconciliation.userId || action.providerAccountId !== reconciliation.accountId) {
    throw new Error('Reconciliation action identity mismatch');
  }
  if (action.provider !== reconciliation.provider || action.actionType !== reconciliation.actionType) throw new Error('Reconciliation action provider/type mismatch');
  if (action.payloadHash !== reconciliation.payloadHash || action.payloadRevision !== reconciliation.payloadRevision) throw new Error('Reconciliation payload binding mismatch');
  if (!account || account.id !== reconciliation.accountId || account.provider !== reconciliation.provider) throw new Error('Connected account does not match reconciliation case');
}

export function buildProviderReconciliationEvidence({ reconciliation, outcome, observedAt = new Date() }) {
  const item = requirePending(reconciliation);
  if (!outcome || !['succeeded', 'not_found', 'unknown'].includes(outcome.status)) throw new Error('Supported provider reconciliation outcome is required');
  const evidence = outcome.evidence && typeof outcome.evidence === 'object' ? outcome.evidence : {};
  const core = {
    actionId: item.actionId,
    userId: item.userId,
    accountId: item.accountId,
    provider: item.provider,
    actionType: item.actionType,
    payloadHash: item.payloadHash,
    payloadRevision: item.payloadRevision,
    approvalRevision: item.approvalRevision,
    idempotencyKeyHash: item.idempotencyKeyHash,
    outcome: outcome.status,
    providerReceiptId: outcome.receipt?.providerMessageId || outcome.receipt?.providerEventId || outcome.receipt?.id || null,
    providerEvidence: stable(evidence),
    observedAt: isoDate(observedAt, 'Evidence observation time'),
  };
  const evidenceHash = hashObject(core);
  return Object.freeze({
    ...core,
    evidenceHash,
    evidenceRef: `sha256:${evidenceHash}`,
    evidenceKind: outcome.status === 'not_found' ? 'provider_confirmed_absence' : 'provider_reconciliation_observation',
  });
}

export function classifyReconciliationLookupError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || 'PROVIDER_LOOKUP_FAILED');
  if (status === 429 || status >= 500 || error?.retryAfterMs > 0 || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code)) {
    return { disposition: 'retry_later', resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT', retryAfterMs: Number(error?.retryAfterMs || 0) || null };
  }
  if (status === 401 || status === 403) return { disposition: 'manual_review', resolutionCode: 'PROVIDER_RECONNECT_REQUIRED', retryAfterMs: null };
  return { disposition: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_FAILED', retryAfterMs: null };
}

export async function orchestrateReconciliation({
  reconciliation,
  action,
  account,
  existingReceipt = null,
  lookupProviderOutcome,
  reconciliationStore,
  evidenceStore = null,
  now = () => new Date(),
}) {
  const item = requirePending(reconciliation);
  assertExactContext(item, action, account);
  if (!reconciliationStore?.resolve) throw new TypeError('Reconciliation store is required');

  if (existingReceipt) {
    const row = await reconciliationStore.resolve({
      actionId: item.actionId,
      status: 'resolved_succeeded',
      providerReceiptId: existingReceipt.providerMessageId || existingReceipt.providerEventId || existingReceipt.id || null,
      resolutionCode: 'LOCAL_RECEIPT_FOUND',
      expectedUpdatedAt: item.updatedAt || null,
    });
    return { disposition: 'resolved_succeeded', resolutionCode: 'LOCAL_RECEIPT_FOUND', receipt: existingReceipt, evidence: null, row };
  }

  if (typeof lookupProviderOutcome !== 'function') {
    const row = await reconciliationStore.resolve({ actionId: item.actionId, status: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_UNAVAILABLE', expectedUpdatedAt: item.updatedAt || null });
    return { disposition: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_UNAVAILABLE', receipt: null, evidence: null, row };
  }

  let outcome;
  try {
    outcome = await lookupProviderOutcome({ account, reconciliation: item, action });
  } catch (error) {
    const classification = classifyReconciliationLookupError(error);
    if (classification.disposition === 'retry_later') return { ...classification, receipt: null, evidence: null, row: null };
    const row = await reconciliationStore.resolve({ actionId: item.actionId, status: 'manual_review', resolutionCode: classification.resolutionCode, expectedUpdatedAt: item.updatedAt || null });
    return { ...classification, receipt: null, evidence: null, row };
  }

  const evidence = buildProviderReconciliationEvidence({ reconciliation: item, outcome, observedAt: now() });
  if (evidenceStore?.append) await evidenceStore.append(evidence);

  if (outcome.status === 'succeeded') {
    if (!outcome.receipt) throw new Error('Successful provider reconciliation must include a receipt');
    const providerReceiptId = evidence.providerReceiptId;
    if (!providerReceiptId) throw new Error('Successful provider reconciliation receipt must have a provider id');
    const row = await reconciliationStore.resolve({ actionId: item.actionId, status: 'resolved_succeeded', providerReceiptId, resolutionCode: 'PROVIDER_CONFIRMED_SUCCESS', expectedUpdatedAt: item.updatedAt || null });
    return { disposition: 'resolved_succeeded', resolutionCode: 'PROVIDER_CONFIRMED_SUCCESS', receipt: outcome.receipt, evidence, row };
  }

  if (outcome.status === 'not_found') {
    const row = await reconciliationStore.resolve({ actionId: item.actionId, status: 'manual_review', resolutionCode: 'PROVIDER_CONFIRMED_ABSENCE_REQUIRES_REAPPROVAL', expectedUpdatedAt: item.updatedAt || null });
    return {
      disposition: 'manual_review',
      resolutionCode: 'PROVIDER_CONFIRMED_ABSENCE_REQUIRES_REAPPROVAL',
      receipt: null,
      evidence,
      adjudicationInput: { evidenceKind: evidence.evidenceKind, evidenceRef: evidence.evidenceRef },
      row,
    };
  }

  const row = await reconciliationStore.resolve({ actionId: item.actionId, status: 'manual_review', resolutionCode: 'PROVIDER_OUTCOME_STILL_UNKNOWN', expectedUpdatedAt: item.updatedAt || null });
  return { disposition: 'manual_review', resolutionCode: 'PROVIDER_OUTCOME_STILL_UNKNOWN', receipt: null, evidence, row };
}

export function createSupabaseReconciliationEvidenceStore({ client, now = () => new Date() }) {
  if (!client?.from) throw new TypeError('Supabase service client is required');
  return {
    async append(evidence) {
      if (!evidence?.evidenceHash || evidence.evidenceRef !== `sha256:${evidence.evidenceHash}`) throw new Error('Validated reconciliation evidence is required');
      const row = {
        action_id: evidence.actionId,
        user_id: evidence.userId,
        account_id: evidence.accountId,
        provider: evidence.provider,
        action_type: evidence.actionType,
        payload_hash: evidence.payloadHash,
        payload_revision: evidence.payloadRevision,
        approval_revision: evidence.approvalRevision,
        idempotency_key_hash: evidence.idempotencyKeyHash,
        outcome: evidence.outcome,
        provider_receipt_id: evidence.providerReceiptId,
        evidence_kind: evidence.evidenceKind,
        evidence_ref: evidence.evidenceRef,
        evidence_hash: evidence.evidenceHash,
        evidence_json: evidence.providerEvidence,
        observed_at: evidence.observedAt,
        created_at: now().toISOString(),
      };
      const result = await client.from('outbound_reconciliation_evidence').insert(row).select('*').single();
      if (result?.error) throw new Error(`append reconciliation evidence: ${result.error.message || 'Supabase operation failed'}`);
      return result?.data;
    },
  };
}
