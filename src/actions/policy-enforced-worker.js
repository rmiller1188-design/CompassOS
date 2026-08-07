import { assertLeaseMatchesAction } from './action-queue.js';
import { assertMailSendConsent } from './mail-execution.js';
import {
  ACTION_TYPES as CALENDAR_ACTION_TYPES,
  assertApprovedCalendarPayloadUnchanged,
  assertCalendarWriteConsent,
} from './calendar-execution.js';
import { assertApprovedPayloadUnchanged } from './reply-draft.js';
import {
  evaluateRuntimeAction,
  verifyRuntimeActionDecision,
} from '../operations/runtime-action-policy.js';

const MAIL_ACTION_TYPE = 'mail.reply';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} is required`);
  return value;
}

function requireExecutionContext(context, claim) {
  if (!context?.action || !context?.account || !context?.payload) {
    throw new TypeError('Execution context must include action, account, and payload');
  }
  const action = context.action;
  const expected = {
    id: claim.action.id,
    userId: claim.action.userId,
    providerAccountId: claim.action.providerAccountId,
    actionType: claim.action.actionType,
    payloadHash: claim.action.payloadHash,
    payloadRevision: claim.action.payloadRevision,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (action[field] !== value) throw new Error(`Execution context mismatch: ${field}`);
  }
  if (action.status !== 'executing') throw new Error('Claimed outbound action is not executing');
  if (context.account.id && context.account.id !== action.providerAccountId) {
    throw new Error('Connected account does not match claimed outbound action');
  }
  if (context.account.provider !== action.provider) {
    throw new Error('Connected account provider does not match outbound action');
  }
  if (!action.approvedPayloadHash || !Number.isInteger(action.approvalRevision)) {
    throw new Error('Persisted approval binding is missing');
  }
  return context;
}

function policyInput(action) {
  return {
    actionId: action.id,
    ownerId: action.userId,
    accountId: action.providerAccountId,
    provider: action.provider,
    actionType: action.actionType,
    state: action.status,
    payloadRevision: action.payloadRevision,
    payloadHash: action.payloadHash,
    approvedPayloadHash: action.approvedPayloadHash,
    approvalRevision: action.approvalRevision,
  };
}

function resolveAdapter({ action, mailAdapters, calendarAdapters }) {
  const adapters = action.actionType === MAIL_ACTION_TYPE ? mailAdapters : calendarAdapters;
  const adapter = adapters?.[action.provider];
  if (!adapter || adapter.provider !== action.provider || typeof adapter.execute !== 'function') {
    throw new Error('Provider execution adapter is unavailable');
  }
  return adapter;
}

function assertActionConsentAndPayload(context) {
  if (context.action.actionType === MAIL_ACTION_TYPE) {
    assertMailSendConsent(context.account);
    assertApprovedPayloadUnchanged({
      approvedPayloadHash: context.action.approvedPayloadHash,
      payload: context.payload,
    });
    return;
  }
  if (!CALENDAR_ACTION_TYPES.has(context.action.actionType)) {
    throw new Error('Unsupported outbound action type');
  }
  assertCalendarWriteConsent(context.account);
  assertApprovedCalendarPayloadUnchanged({
    approvedPayloadHash: context.action.approvedPayloadHash,
    payload: context.payload,
  });
}

async function failClaim({ transition, claim, error, policyDecision = null }) {
  await transition(claim.action.id, 'failed', {
    expectedRevision: claim.action.revision,
    metadata: {
      workerId: claim.lease.workerId,
      errorCode: error.code || null,
      retryable: error.retryable === true,
      policyDecisionHash: policyDecision?.decisionHash || null,
      policyDecision: policyDecision?.decision || null,
      policyFailedChecks: policyDecision?.failedChecks || [],
    },
  });
}

export async function executePolicyEnforcedClaim({
  claim,
  loadExecutionContext,
  loadPolicy,
  recordPolicyDecision,
  getReceiptByIdempotencyKey,
  transition,
  mailAdapters,
  calendarAdapters,
  now = () => new Date(),
  maxPolicyAgeMs = 15 * 60 * 1000,
}) {
  if (!claim?.action || !claim?.lease) throw new TypeError('Claimed action and lease are required');
  requireFunction(loadExecutionContext, 'Execution-context loader');
  requireFunction(loadPolicy, 'Runtime-policy loader');
  requireFunction(recordPolicyDecision, 'Policy-decision recorder');
  requireFunction(getReceiptByIdempotencyKey, 'Receipt lookup');
  requireFunction(transition, 'Action transition function');

  assertLeaseMatchesAction(claim.lease, claim.action, now());

  let context;
  let decision;
  try {
    context = requireExecutionContext(await loadExecutionContext(claim.action), claim);
    assertLeaseMatchesAction(claim.lease, context.action, now());

    const policy = await loadPolicy({
      userId: context.action.userId,
      accountId: context.action.providerAccountId,
      provider: context.action.provider,
      actionType: context.action.actionType,
    });
    decision = evaluateRuntimeAction({
      policy,
      action: policyInput(context.action),
      now: now(),
      maxPolicyAgeMs,
    });
    if (!verifyRuntimeActionDecision(decision)) throw new Error('Runtime policy decision integrity check failed');

    await recordPolicyDecision({ action: context.action, decision });
    if (decision.decision !== 'allow') {
      const error = new Error(`Outbound execution blocked by runtime policy: ${decision.failedChecks.join(', ')}`);
      error.code = 'RUNTIME_POLICY_BLOCKED';
      error.retryable = false;
      throw error;
    }

    assertActionConsentAndPayload(context);

    const existing = await getReceiptByIdempotencyKey(context.action.idempotencyKey);
    if (existing) {
      await transition(claim.action.id, 'succeeded', {
        expectedRevision: claim.action.revision,
        metadata: {
          workerId: claim.lease.workerId,
          providerReceiptId: existing.providerMessageId || existing.providerEventId || existing.id || null,
          policyDecisionHash: decision.decisionHash,
          idempotentReplay: true,
        },
      });
      return existing;
    }

    const adapter = resolveAdapter({
      action: context.action,
      mailAdapters,
      calendarAdapters,
    });
    const receipt = await adapter.execute({
      account: context.account,
      payload: context.payload,
      idempotencyKey: context.action.idempotencyKey,
    });

    await transition(claim.action.id, 'succeeded', {
      expectedRevision: claim.action.revision,
      metadata: {
        workerId: claim.lease.workerId,
        providerReceiptId: receipt?.providerMessageId || receipt?.providerEventId || receipt?.id || null,
        policyDecisionHash: decision.decisionHash,
      },
    });
    return receipt;
  } catch (error) {
    await failClaim({ transition, claim, error, policyDecision: decision });
    throw error;
  }
}

export function createPolicyEnforcedActionWorker({ queue, ...dependencies }) {
  if (!queue?.claimNext) throw new TypeError('Action queue is required');
  return {
    async runOnce({ actionTypes = null } = {}) {
      const claim = await queue.claimNext({ actionTypes });
      if (!claim) return { status: 'idle', receipt: null };
      const receipt = await executePolicyEnforcedClaim({ claim, ...dependencies });
      return { status: 'executed', actionId: claim.action.id, receipt };
    },
  };
}
