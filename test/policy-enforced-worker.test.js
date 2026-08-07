import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExecutionLease } from '../src/actions/action-queue.js';
import { createReplyApprovalPayload } from '../src/actions/reply-draft.js';
import { createRuntimeActionPolicy } from '../src/operations/runtime-action-policy.js';
import { executePolicyEnforcedClaim } from '../src/actions/policy-enforced-worker.js';

const NOW = new Date('2026-08-07T17:00:00.000Z');

function fixture() {
  const { payload, payloadHash } = createReplyApprovalPayload({
    accountId: 'acct_1',
    threadKey: 'thread_1',
    inReplyToMessageId: 'msg_1',
    to: ['person@example.com'],
    subject: 'Re: Update',
    bodyText: 'Confirmed.',
    sourceMessageIds: ['msg_1'],
  });
  const approved = {
    id: 'act_1', userId: 'user_1', providerAccountId: 'acct_1', actionType: 'mail.reply',
    payloadHash, payloadRevision: 2, status: 'approved', revision: 8,
  };
  const lease = buildExecutionLease({ action: approved, workerId: 'worker_1', now: NOW, leaseDurationMs: 60_000 });
  const claimed = { ...approved, status: 'executing', revision: 9 };
  const claim = { action: claimed, lease: { ...lease, expectedRevision: 9 } };
  const context = {
    action: {
      ...claimed,
      provider: 'google',
      approvedPayloadHash: payloadHash,
      approvalRevision: 2,
      idempotencyKey: 'idem_1',
    },
    account: {
      id: 'acct_1', provider: 'google', status: 'active',
      grantedScopes: ['https://www.googleapis.com/auth/gmail.send'],
    },
    payload,
  };
  return { claim, context };
}

function policy(blockRules = []) {
  return createRuntimeActionPolicy({
    policyId: 'policy_1', revision: 1, generatedAt: NOW.toISOString(), blockRules,
  });
}

function deps(overrides = {}) {
  const { claim, context } = fixture();
  const transitions = [];
  const decisions = [];
  let executions = 0;
  return {
    claim,
    transitions,
    decisions,
    get executions() { return executions; },
    args: {
      claim,
      loadExecutionContext: async () => context,
      loadPolicy: async () => policy(),
      recordPolicyDecision: async ({ decision }) => decisions.push(decision),
      getReceiptByIdempotencyKey: async () => null,
      transition: async (id, status, options) => transitions.push({ id, status, options }),
      mailAdapters: {
        google: { provider: 'google', execute: async () => { executions += 1; return { providerMessageId: 'provider_msg_1' }; } },
      },
      calendarAdapters: {},
      now: () => NOW,
      ...overrides,
    },
  };
}

test('executes a leased approved action only after an allow decision is durably recorded', async () => {
  const run = deps();
  const receipt = await executePolicyEnforcedClaim(run.args);
  assert.equal(receipt.providerMessageId, 'provider_msg_1');
  assert.equal(run.executions, 1);
  assert.equal(run.decisions.length, 1);
  assert.equal(run.decisions[0].decision, 'allow');
  assert.equal(run.transitions.at(-1).status, 'succeeded');
  assert.equal(run.transitions.at(-1).options.metadata.policyDecisionHash, run.decisions[0].decisionHash);
});

test('blocks provider execution when an emergency rule applies and records the block decision', async () => {
  const run = deps({
    loadPolicy: async () => policy([{ ruleId: 'stop_all', scope: 'global', reasonCode: 'incident', createdAt: NOW.toISOString() }]),
  });
  await assert.rejects(() => executePolicyEnforcedClaim(run.args), /blocked by runtime policy/);
  assert.equal(run.executions, 0);
  assert.equal(run.decisions[0].decision, 'block');
  assert.equal(run.transitions.at(-1).status, 'failed');
  assert.equal(run.transitions.at(-1).options.metadata.errorCode, 'RUNTIME_POLICY_BLOCKED');
});

test('fails closed before provider execution if policy-decision persistence fails', async () => {
  const run = deps({ recordPolicyDecision: async () => { throw new Error('audit unavailable'); } });
  await assert.rejects(() => executePolicyEnforcedClaim(run.args), /audit unavailable/);
  assert.equal(run.executions, 0);
  assert.equal(run.transitions.at(-1).status, 'failed');
});

test('rejects missing or stale persisted approval binding before provider execution', async () => {
  const run = deps({
    loadExecutionContext: async () => {
      const { context } = fixture();
      return { ...context, action: { ...context.action, approvalRevision: 1 } };
    },
  });
  await assert.rejects(() => executePolicyEnforcedClaim(run.args), /approval-bound|runtime policy/i);
  assert.equal(run.executions, 0);
  assert.equal(run.transitions.at(-1).status, 'failed');
});

test('uses an existing idempotency receipt without re-executing the provider', async () => {
  const existing = { providerMessageId: 'already_sent' };
  const run = deps({ getReceiptByIdempotencyKey: async () => existing });
  const receipt = await executePolicyEnforcedClaim(run.args);
  assert.equal(receipt, existing);
  assert.equal(run.executions, 0);
  assert.equal(run.transitions.at(-1).status, 'succeeded');
  assert.equal(run.transitions.at(-1).options.metadata.idempotentReplay, true);
});

test('rejects execution-context drift from the leased action', async () => {
  const run = deps({
    loadExecutionContext: async () => {
      const { context } = fixture();
      return { ...context, action: { ...context.action, payloadRevision: 3 } };
    },
  });
  await assert.rejects(() => executePolicyEnforcedClaim(run.args), /Execution context mismatch: payloadRevision/);
  assert.equal(run.executions, 0);
});
