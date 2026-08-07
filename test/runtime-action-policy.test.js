import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRuntimeActionPolicy,
  evaluateRuntimeAction,
  verifyRuntimeActionDecision,
  verifyRuntimeActionPolicy,
} from '../src/operations/runtime-action-policy.js';

const payloadHash = 'a'.repeat(64);

function action(overrides = {}) {
  return {
    actionId: 'act_1',
    ownerId: 'user_1',
    accountId: 'acct_1',
    provider: 'google',
    actionType: 'mail.reply',
    state: 'approved',
    payloadRevision: 3,
    payloadHash,
    approvedPayloadHash: payloadHash,
    approvalRevision: 3,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return createRuntimeActionPolicy({
    policyId: 'policy_1',
    revision: 4,
    generatedAt: '2026-08-07T15:00:00.000Z',
    blockRules: [],
    ...overrides,
  });
}

test('allows only a current policy with approval bound to exact payload revision and hash', () => {
  const current = policy();
  const decision = evaluateRuntimeAction({ policy: current, action: action(), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(decision.decision, 'allow');
  assert.deepEqual(decision.failedChecks, []);
  assert.equal(verifyRuntimeActionPolicy(current), true);
  assert.equal(verifyRuntimeActionDecision(decision), true);
});

test('fails closed when the action is not approved', () => {
  const decision = evaluateRuntimeAction({
    policy: policy(),
    action: action({ state: 'pending_approval' }),
    now: '2026-08-07T15:05:00.000Z',
  });
  assert.equal(decision.decision, 'block');
  assert.deepEqual(decision.failedChecks, ['approval-bound']);
});

test('fails closed after payload mutation or approval revision mismatch', () => {
  const mutated = evaluateRuntimeAction({
    policy: policy(),
    action: action({ payloadHash: 'b'.repeat(64) }),
    now: '2026-08-07T15:05:00.000Z',
  });
  assert.equal(mutated.decision, 'block');
  assert.ok(mutated.failedChecks.includes('approval-bound'));

  const staleApproval = evaluateRuntimeAction({
    policy: policy(),
    action: action({ payloadRevision: 4, approvalRevision: 3 }),
    now: '2026-08-07T15:05:00.000Z',
  });
  assert.equal(staleApproval.decision, 'block');
});

test('global block applies to every supported outbound action', () => {
  const blocked = policy({
    blockRules: [{
      ruleId: 'kill_all',
      scope: 'global',
      reasonCode: 'incident_response',
      createdAt: '2026-08-07T15:01:00.000Z',
    }],
  });
  const decision = evaluateRuntimeAction({ policy: blocked, action: action(), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(decision.decision, 'block');
  assert.deepEqual(decision.activeBlockRules, [{ ruleId: 'kill_all', scope: 'global', reasonCode: 'incident_response' }]);
});

test('provider, account, and action block scopes do not spill into unrelated actions', () => {
  const blocked = policy({
    blockRules: [
      { ruleId: 'ms_stop', scope: 'provider', provider: 'microsoft', reasonCode: 'graph_incident', createdAt: '2026-08-07T15:01:00.000Z' },
      { ruleId: 'acct_stop', scope: 'account', provider: 'google', accountId: 'acct_2', reasonCode: 'account_reconnect', createdAt: '2026-08-07T15:01:00.000Z' },
      { ruleId: 'calendar_stop', scope: 'action', provider: 'google', accountId: 'acct_1', actionType: 'calendar.update', reasonCode: 'calendar_guard', createdAt: '2026-08-07T15:01:00.000Z' },
    ],
  });
  const allowed = evaluateRuntimeAction({ policy: blocked, action: action(), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(allowed.decision, 'allow');

  const microsoft = evaluateRuntimeAction({ policy: blocked, action: action({ provider: 'microsoft' }), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(microsoft.decision, 'block');
  assert.equal(microsoft.activeBlockRules[0].ruleId, 'ms_stop');

  const accountBlocked = evaluateRuntimeAction({ policy: blocked, action: action({ accountId: 'acct_2' }), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(accountBlocked.decision, 'block');

  const calendarBlocked = evaluateRuntimeAction({ policy: blocked, action: action({ actionType: 'calendar.update' }), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(calendarBlocked.decision, 'block');
});

test('expired block rule stops blocking and future-dated rule does not activate early', () => {
  const scoped = policy({
    blockRules: [
      { ruleId: 'expired', scope: 'global', reasonCode: 'maintenance', createdAt: '2026-08-07T14:00:00.000Z', expiresAt: '2026-08-07T14:30:00.000Z' },
      { ruleId: 'future', scope: 'global', reasonCode: 'scheduled_maintenance', createdAt: '2026-08-07T16:00:00.000Z', expiresAt: '2026-08-07T17:00:00.000Z' },
    ],
  });
  const decision = evaluateRuntimeAction({ policy: scoped, action: action(), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(decision.decision, 'allow');
});

test('stale or future policy fails closed', () => {
  const stale = evaluateRuntimeAction({ policy: policy(), action: action(), now: '2026-08-07T15:16:00.001Z' });
  assert.equal(stale.decision, 'block');
  assert.ok(stale.failedChecks.includes('policy-current'));

  const future = evaluateRuntimeAction({ policy: policy(), action: action(), now: '2026-08-07T14:59:59.999Z' });
  assert.equal(future.decision, 'block');
});

test('policy and decision tampering is detected', () => {
  const current = policy();
  assert.equal(verifyRuntimeActionPolicy({ ...current, revision: 99 }), false);
  const decision = evaluateRuntimeAction({ policy: current, action: action(), now: '2026-08-07T15:05:00.000Z' });
  assert.equal(verifyRuntimeActionDecision({ ...decision, decision: 'block' }), false);
});

test('rejects duplicate rules and unsupported action/provider values', () => {
  assert.throws(() => policy({
    blockRules: [
      { ruleId: 'dup', scope: 'global', reasonCode: 'x', createdAt: '2026-08-07T15:00:00.000Z' },
      { ruleId: 'dup', scope: 'global', reasonCode: 'y', createdAt: '2026-08-07T15:00:00.000Z' },
    ],
  }), /duplicate ruleId/);
  assert.throws(() => evaluateRuntimeAction({ policy: policy(), action: action({ provider: 'imap' }) }), /unsupported/);
  assert.throws(() => evaluateRuntimeAction({ policy: policy(), action: action({ actionType: 'mail.send' }) }), /unsupported/);
});
