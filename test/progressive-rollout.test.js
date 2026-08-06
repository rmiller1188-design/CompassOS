import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRolloutPlan,
  evaluateRolloutStep,
  verifyRolloutDecision,
  verifyRolloutPlan,
} from '../src/operations/progressive-rollout.js';

const digest = (value) => value.repeat(64).slice(0, 64);

function plan(overrides = {}) {
  return createRolloutPlan({
    rolloutId: 'rollout-1',
    releaseId: 'release-1',
    candidateHash: digest('a'),
    promotionReportHash: digest('b'),
    targetEnvironment: 'production',
    strategy: 'canary',
    initialPercent: 5,
    rollbackArtifactDigest: digest('c'),
    createdAt: '2026-08-06T18:00:00.000Z',
    ...overrides,
  });
}

function healthyObservation(planHash, overrides = {}) {
  return {
    planHash,
    observedAt: '2026-08-06T18:10:00.000Z',
    sampleCount: 500,
    errorRate: 0.002,
    p95LatencyMs: 600,
    maxQueueAgeMs: 30000,
    criticalAlerts: 0,
    rollbackReady: true,
    ...overrides,
  };
}

test('creates an immutable rollout plan bound to release and rollback artifacts', () => {
  const value = plan();
  assert.equal(value.strategy, 'canary');
  assert.equal(value.initialPercent, 5);
  assert.equal(verifyRolloutPlan(value), true);
  assert.equal(Object.isFrozen(value), true);
});

test('advances only when every observation gate passes', () => {
  const value = plan();
  const decision = evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(value.planHash),
    currentPercent: 5,
    requestedPercent: 25,
    now: '2026-08-06T18:12:00.000Z',
  });
  assert.equal(decision.decision, 'advance');
  assert.equal(decision.nextPercent, 25);
  assert.equal(decision.rollbackArtifactDigest, null);
  assert.equal(verifyRolloutDecision(decision), true);
});

test('fails closed to rollback on elevated provider error rate', () => {
  const value = plan();
  const decision = evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(value.planHash, { errorRate: 0.2 }),
    currentPercent: 5,
    requestedPercent: 25,
    now: '2026-08-06T18:12:00.000Z',
  });
  assert.equal(decision.decision, 'rollback');
  assert.deepEqual(decision.failedChecks, ['error-rate']);
  assert.equal(decision.nextPercent, 5);
  assert.equal(decision.rollbackArtifactDigest, digest('c'));
});

test('rejects stale, mismatched, and under-sampled observations', () => {
  const value = plan();
  const decision = evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(digest('d'), {
      observedAt: '2026-08-06T17:00:00.000Z',
      sampleCount: 1,
    }),
    currentPercent: 5,
    requestedPercent: 10,
    now: '2026-08-06T18:12:00.000Z',
  });
  assert.equal(decision.decision, 'rollback');
  assert.deepEqual(decision.failedChecks, ['plan-bound', 'observation-current', 'sample-threshold']);
});

test('requires rollback readiness before advancing', () => {
  const value = plan();
  const decision = evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(value.planHash, { rollbackReady: false }),
    currentPercent: 5,
    requestedPercent: 25,
    now: '2026-08-06T18:12:00.000Z',
  });
  assert.equal(decision.decision, 'rollback');
  assert.deepEqual(decision.failedChecks, ['rollback-ready']);
});

test('detects plan and decision tampering', () => {
  const value = plan();
  assert.equal(verifyRolloutPlan({ ...value, initialPercent: 50 }), false);
  const decision = evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(value.planHash),
    currentPercent: 5,
    requestedPercent: 25,
    now: '2026-08-06T18:12:00.000Z',
  });
  assert.equal(verifyRolloutDecision({ ...decision, requestedPercent: 100 }), false);
});

test('rejects unsafe or malformed rollout configuration', () => {
  assert.throws(() => plan({ strategy: 'all-at-once', initialPercent: 10 }), /100 percent/);
  assert.throws(() => plan({ thresholds: { maxErrorRate: 2 } }), /between 0 and 1/);
  const value = plan();
  assert.throws(() => evaluateRolloutStep({
    plan: value,
    observation: healthyObservation(value.planHash),
    currentPercent: 25,
    requestedPercent: 25,
  }), /must exceed/);
});
