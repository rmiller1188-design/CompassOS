import { createHash } from 'node:crypto';

const COMMANDS = new Set(['confirm_succeeded', 'close_failed', 'prepare_retry']);

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
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertBound(reconciliation, action) {
  if (!reconciliation?.actionId || !action?.id) throw new TypeError('Reconciliation case and outbound action are required');
  if (reconciliation.actionId !== action.id) throw new Error('Reconciliation action binding mismatch');
  if (reconciliation.userId !== action.userId) throw new Error('Reconciliation owner binding mismatch');
  if (reconciliation.accountId !== action.providerAccountId) throw new Error('Reconciliation account binding mismatch');
  if (reconciliation.payloadHash !== action.payloadHash) throw new Error('Reconciliation payload hash is stale');
  if (reconciliation.payloadRevision !== action.payloadRevision) throw new Error('Reconciliation payload revision is stale');
  if (reconciliation.approvalRevision !== action.approvalRevision) throw new Error('Reconciliation approval revision is stale');
  if (reconciliation.status !== 'manual_review') throw new Error('Manual-review reconciliation case is required');
  if (action.status !== 'failed') throw new Error('Quarantined outbound action must remain failed during manual review');
}

export function hashReviewEvidence(value) {
  return sha256(requireString(value, 'Review evidence'));
}

export function buildManualReconciliationDecision({
  reconciliation,
  action,
  command,
  reviewerId,
  reviewNote,
  evidence = null,
  providerReceiptId = null,
  now = new Date(),
}) {
  assertBound(reconciliation, action);
  if (!COMMANDS.has(command)) throw new Error('Unsupported reconciliation review command');
  const reviewedAt = isoDate(now, 'Review time');
  const note = requireString(reviewNote, 'Review note');
  const reviewer = requireString(reviewerId, 'Reviewer id');
  const caseUpdatedAt = isoDate(reconciliation.updatedAt, 'Reconciliation case updated time');
  const receiptId = providerReceiptId == null ? null : requireString(providerReceiptId, 'Provider receipt id');
  const evidenceHash = evidence == null ? null : hashReviewEvidence(evidence);

  if (command === 'confirm_succeeded' && !receiptId && !evidenceHash) {
    throw new Error('Confirming success requires provider receipt or external evidence');
  }

  const body = {
    actionId: action.id,
    userId: action.userId,
    accountId: action.providerAccountId,
    provider: action.provider,
    actionType: action.actionType,
    command,
    reviewerId: reviewer,
    reviewNote: note,
    evidenceHash,
    providerReceiptId: receiptId,
    payloadHash: action.payloadHash,
    payloadRevision: action.payloadRevision,
    approvalRevision: action.approvalRevision,
    reconciliationUpdatedAt: caseUpdatedAt,
    reviewedAt,
    requiresFreshApproval: command === 'prepare_retry',
    authorizesProviderExecution: false,
  };

  return { ...body, decisionHash: sha256(JSON.stringify(stable(body))) };
}

export function verifyManualReconciliationDecision(decision) {
  if (!decision || !COMMANDS.has(decision.command) || !decision.decisionHash) return false;
  const { decisionHash, ...body } = decision;
  return decisionHash === sha256(JSON.stringify(stable(body)));
}

export function dispositionForManualDecision(decision) {
  if (!verifyManualReconciliationDecision(decision)) throw new Error('Manual reconciliation decision integrity check failed');
  if (decision.command === 'confirm_succeeded') {
    return {
      reconciliationStatus: 'resolved_succeeded',
      resolutionCode: 'MANUAL_CONFIRMED_SUCCESS',
      providerReceiptId: decision.providerReceiptId,
      retryRequest: null,
    };
  }
  if (decision.command === 'close_failed') {
    return {
      reconciliationStatus: 'resolved_failed',
      resolutionCode: 'MANUAL_CLOSED_FAILED_NO_RETRY',
      providerReceiptId: null,
      retryRequest: null,
    };
  }
  return {
    reconciliationStatus: 'manual_review',
    resolutionCode: 'MANUAL_RETRY_REAPPROVAL_REQUIRED',
    providerReceiptId: null,
    retryRequest: {
      sourceActionId: decision.actionId,
      sourceDecisionHash: decision.decisionHash,
      payloadHash: decision.payloadHash,
      payloadRevision: decision.payloadRevision,
      approvalRevision: decision.approvalRevision,
      requiresFreshApproval: true,
      authorizesProviderExecution: false,
    },
  };
}

function assertResult(result, operation) {
  if (result?.error) {
    const error = new Error(`${operation}: ${result.error.message || 'Supabase operation failed'}`);
    error.code = result.error.code;
    throw error;
  }
  return result?.data;
}

export function createSupabaseReconciliationReviewStore({ client, now = () => new Date() }) {
  if (!client?.from) throw new TypeError('Supabase service client is required');

  return {
    async record(decision) {
      if (!verifyManualReconciliationDecision(decision)) throw new Error('Manual reconciliation decision integrity check failed');
      const row = {
        action_id: decision.actionId,
        user_id: decision.userId,
        account_id: decision.accountId,
        command: decision.command,
        reviewer_id: decision.reviewerId,
        review_note: decision.reviewNote,
        evidence_hash: decision.evidenceHash,
        provider_receipt_id: decision.providerReceiptId,
        payload_hash: decision.payloadHash,
        payload_revision: decision.payloadRevision,
        approval_revision: decision.approvalRevision,
        reconciliation_updated_at: decision.reconciliationUpdatedAt,
        reviewed_at: decision.reviewedAt,
        requires_fresh_approval: decision.requiresFreshApproval,
        authorizes_provider_execution: false,
        decision_hash: decision.decisionHash,
        created_at: now().toISOString(),
      };
      return assertResult(await client.from('outbound_action_reconciliation_reviews').insert(row).select('*').single(), 'record reconciliation review');
    },
  };
}
