import { createHash } from 'node:crypto';

const OUTCOMES = new Set(['confirmed_succeeded', 'closed_no_retry', 'retry_eligible']);
const RETRY_EVIDENCE_KIND = 'provider_confirmed_absence';

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

function requireManualReviewCase(reconciliation) {
  if (!reconciliation || reconciliation.status !== 'manual_review') throw new Error('Manual-review reconciliation case is required');
  for (const [key, label] of [
    ['actionId', 'Action id'],
    ['userId', 'User id'],
    ['accountId', 'Account id'],
    ['provider', 'Provider'],
    ['actionType', 'Action type'],
    ['payloadHash', 'Payload hash'],
    ['idempotencyKeyHash', 'Idempotency-key hash'],
  ]) requireString(reconciliation[key], label);
  if (!Number.isInteger(reconciliation.payloadRevision) || reconciliation.payloadRevision < 1) throw new TypeError('Payload revision must be a positive integer');
  if (!Number.isInteger(reconciliation.approvalRevision) || reconciliation.approvalRevision < 1) throw new TypeError('Approval revision must be a positive integer');
  return reconciliation;
}

export function buildReconciliationAdjudication({
  reconciliation,
  reviewerId,
  outcome,
  evidenceKind,
  evidenceRef,
  providerReceiptId = null,
  note = null,
  now = new Date(),
  retryGrantTtlMs = 15 * 60 * 1000,
}) {
  const item = requireManualReviewCase(reconciliation);
  const reviewer = requireString(reviewerId, 'Reviewer id');
  if (!OUTCOMES.has(outcome)) throw new Error('Unsupported reconciliation adjudication outcome');
  const kind = requireString(evidenceKind, 'Evidence kind');
  const ref = requireString(evidenceRef, 'Evidence reference');
  const reviewedAt = isoDate(now, 'Review time');

  if (outcome === 'confirmed_succeeded' && !providerReceiptId) throw new Error('Confirmed success requires a provider receipt id');
  if (outcome === 'retry_eligible') {
    if (kind !== RETRY_EVIDENCE_KIND) throw new Error('Retry eligibility requires provider-confirmed absence evidence');
    if (!Number.isFinite(retryGrantTtlMs) || retryGrantTtlMs <= 0 || retryGrantTtlMs > 60 * 60 * 1000) throw new Error('Retry grant TTL must be between 1 ms and 1 hour');
  }

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
    reviewerId: reviewer,
    outcome,
    evidenceKind: kind,
    evidenceRef: ref,
    providerReceiptId: providerReceiptId ? requireString(providerReceiptId, 'Provider receipt id') : null,
    note: note == null ? null : requireString(note, 'Review note'),
    reviewedAt,
    retryGrantExpiresAt: outcome === 'retry_eligible' ? new Date(new Date(reviewedAt).getTime() + retryGrantTtlMs).toISOString() : null,
  };

  return { ...core, decisionHash: hashObject(core) };
}

export function verifyReconciliationAdjudication(adjudication) {
  if (!adjudication?.decisionHash) return false;
  const { decisionHash, ...core } = adjudication;
  return hashObject(core) === decisionHash;
}

export function assertRetryAdmission({ reconciliation, adjudication, action, newIdempotencyKeyHash, now = new Date() }) {
  const item = requireManualReviewCase(reconciliation);
  if (!verifyReconciliationAdjudication(adjudication)) throw new Error('Reconciliation adjudication integrity check failed');
  if (adjudication.outcome !== 'retry_eligible') throw new Error('Reconciliation adjudication does not permit retry admission');
  if (adjudication.evidenceKind !== RETRY_EVIDENCE_KIND) throw new Error('Retry evidence is insufficient');
  if (adjudication.actionId !== item.actionId || adjudication.userId !== item.userId || adjudication.accountId !== item.accountId) throw new Error('Adjudication identity does not match reconciliation case');
  if (adjudication.payloadHash !== item.payloadHash || adjudication.payloadRevision !== item.payloadRevision || adjudication.approvalRevision !== item.approvalRevision) throw new Error('Adjudication binding does not match reconciliation case');
  if (new Date(adjudication.retryGrantExpiresAt).getTime() <= new Date(now).getTime()) throw new Error('Retry grant has expired');

  if (!action || action.id !== item.actionId || action.userId !== item.userId || action.providerAccountId !== item.accountId) throw new Error('Retry action identity mismatch');
  if (action.status !== 'approved') throw new Error('Retry action must have a fresh approved state');
  if (action.payloadHash !== item.payloadHash || action.payloadRevision !== item.payloadRevision) throw new Error('Retry cannot mutate the reconciled payload');
  if (!Number.isInteger(action.approvalRevision) || action.approvalRevision <= item.approvalRevision) throw new Error('Retry requires a newer explicit approval revision');
  if (action.approvedPayloadHash !== action.payloadHash) throw new Error('Retry approval payload binding is invalid');

  const nextKeyHash = requireString(newIdempotencyKeyHash, 'New idempotency-key hash');
  if (nextKeyHash === item.idempotencyKeyHash) throw new Error('Retry requires a newly derived idempotency key');

  return {
    allowed: true,
    actionId: item.actionId,
    priorApprovalRevision: item.approvalRevision,
    retryApprovalRevision: action.approvalRevision,
    adjudicationHash: adjudication.decisionHash,
    evidenceRef: adjudication.evidenceRef,
    newIdempotencyKeyHash: nextKeyHash,
    admittedAt: isoDate(now, 'Admission time'),
  };
}

export function createSupabaseAdjudicationStore({ client, now = () => new Date() }) {
  if (!client?.from || !client?.rpc) throw new TypeError('Supabase service client is required');

  function assertResult(result, operation) {
    if (result?.error) {
      const error = new Error(`${operation}: ${result.error.message || 'Supabase operation failed'}`);
      error.code = result.error.code;
      throw error;
    }
    return result?.data;
  }

  return {
    async append(adjudication) {
      if (!verifyReconciliationAdjudication(adjudication)) throw new Error('Reconciliation adjudication integrity check failed');
      const row = {
        action_id: adjudication.actionId,
        user_id: adjudication.userId,
        account_id: adjudication.accountId,
        reviewer_id: adjudication.reviewerId,
        outcome: adjudication.outcome,
        evidence_kind: adjudication.evidenceKind,
        evidence_ref: adjudication.evidenceRef,
        provider_receipt_id: adjudication.providerReceiptId,
        payload_hash: adjudication.payloadHash,
        payload_revision: adjudication.payloadRevision,
        approval_revision: adjudication.approvalRevision,
        idempotency_key_hash: adjudication.idempotencyKeyHash,
        retry_grant_expires_at: adjudication.retryGrantExpiresAt,
        decision_hash: adjudication.decisionHash,
        reviewed_at: adjudication.reviewedAt,
        note: adjudication.note,
        created_at: now().toISOString(),
      };
      return assertResult(await client.from('outbound_reconciliation_adjudications').insert(row).select('*').single(), 'append reconciliation adjudication');
    },

    async consumeRetryGrant(admission) {
      if (!admission?.allowed) throw new Error('Validated retry admission is required');
      return assertResult(await client.rpc('consume_reconciliation_retry_grant', {
        p_action_id: admission.actionId,
        p_decision_hash: admission.adjudicationHash,
        p_retry_approval_revision: admission.retryApprovalRevision,
        p_new_idempotency_key_hash: admission.newIdempotencyKeyHash,
      }), 'consume reconciliation retry grant');
    },
  };
}
