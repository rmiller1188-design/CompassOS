import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const ENVIRONMENTS = new Set(['staging', 'production']);
const STRATEGIES = new Set(['canary', 'percentage', 'all-at-once']);

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function requireDigest(value, name) {
  const digest = requireString(value, name).replace(/^sha256:/, '');
  if (!SHA256.test(digest)) throw new TypeError(`${name} must be a SHA-256 digest`);
  return digest;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function normalizeThresholds(input = {}) {
  assertObject(input, 'thresholds');
  const thresholds = {
    maxErrorRate: input.maxErrorRate ?? 0.01,
    maxP95LatencyMs: input.maxP95LatencyMs ?? 1500,
    maxQueueAgeMs: input.maxQueueAgeMs ?? 300000,
    minHealthySamples: input.minHealthySamples ?? 100,
  };
  if (!Number.isFinite(thresholds.maxErrorRate) || thresholds.maxErrorRate < 0 || thresholds.maxErrorRate > 1) {
    throw new TypeError('maxErrorRate must be between 0 and 1');
  }
  for (const key of ['maxP95LatencyMs', 'maxQueueAgeMs']) {
    if (!Number.isFinite(thresholds[key]) || thresholds[key] <= 0) throw new TypeError(`${key} must be positive`);
  }
  if (!Number.isInteger(thresholds.minHealthySamples) || thresholds.minHealthySamples < 1) {
    throw new TypeError('minHealthySamples must be a positive integer');
  }
  return thresholds;
}

export function createRolloutPlan(input) {
  assertObject(input, 'rollout plan');
  const targetEnvironment = requireString(input.targetEnvironment, 'targetEnvironment');
  if (!ENVIRONMENTS.has(targetEnvironment)) throw new TypeError('targetEnvironment must be staging or production');
  const strategy = requireString(input.strategy, 'strategy');
  if (!STRATEGIES.has(strategy)) throw new TypeError('strategy must be canary, percentage, or all-at-once');
  const initialPercent = input.initialPercent ?? (strategy === 'canary' ? 5 : strategy === 'percentage' ? 10 : 100);
  if (!Number.isInteger(initialPercent) || initialPercent < 1 || initialPercent > 100) {
    throw new TypeError('initialPercent must be an integer from 1 to 100');
  }
  if (strategy === 'all-at-once' && initialPercent !== 100) {
    throw new TypeError('all-at-once rollout must use 100 percent');
  }
  const createdAt = new Date(input.createdAt ?? new Date());
  if (Number.isNaN(createdAt.getTime())) throw new TypeError('createdAt must be an ISO timestamp');
  const payload = {
    rolloutId: requireString(input.rolloutId, 'rolloutId'),
    releaseId: requireString(input.releaseId, 'releaseId'),
    candidateHash: requireDigest(input.candidateHash, 'candidateHash'),
    promotionReportHash: requireDigest(input.promotionReportHash, 'promotionReportHash'),
    targetEnvironment,
    strategy,
    initialPercent,
    thresholds: normalizeThresholds(input.thresholds),
    rollbackArtifactDigest: requireDigest(input.rollbackArtifactDigest, 'rollbackArtifactDigest'),
    createdAt: createdAt.toISOString(),
  };
  return Object.freeze({ ...payload, planHash: hash(payload) });
}

export function evaluateRolloutStep({ plan, observation, currentPercent = 0, requestedPercent, now = new Date() }) {
  assertObject(plan, 'plan');
  assertObject(observation, 'observation');
  if (!verifyRolloutPlan(plan)) throw new TypeError('plan integrity check failed');
  if (!Number.isInteger(currentPercent) || currentPercent < 0 || currentPercent > 100) {
    throw new TypeError('currentPercent must be an integer from 0 to 100');
  }
  if (!Number.isInteger(requestedPercent) || requestedPercent < 1 || requestedPercent > 100) {
    throw new TypeError('requestedPercent must be an integer from 1 to 100');
  }
  if (requestedPercent <= currentPercent) throw new TypeError('requestedPercent must exceed currentPercent');
  const evaluatedAt = new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new TypeError('now must be a valid date');
  const observedAt = new Date(observation.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new TypeError('observation observedAt must be an ISO timestamp');
  const ageMs = evaluatedAt.getTime() - observedAt.getTime();

  const checks = [
    { id: 'plan-bound', passed: observation.planHash === plan.planHash },
    { id: 'observation-current', passed: ageMs >= 0 && ageMs <= 15 * 60 * 1000 },
    { id: 'sample-threshold', passed: Number.isInteger(observation.sampleCount) && observation.sampleCount >= plan.thresholds.minHealthySamples },
    { id: 'error-rate', passed: Number.isFinite(observation.errorRate) && observation.errorRate <= plan.thresholds.maxErrorRate },
    { id: 'p95-latency', passed: Number.isFinite(observation.p95LatencyMs) && observation.p95LatencyMs <= plan.thresholds.maxP95LatencyMs },
    { id: 'queue-age', passed: Number.isFinite(observation.maxQueueAgeMs) && observation.maxQueueAgeMs <= plan.thresholds.maxQueueAgeMs },
    { id: 'no-critical-alerts', passed: observation.criticalAlerts === 0 },
    { id: 'rollback-ready', passed: observation.rollbackReady === true },
  ].map((check) => Object.freeze(check));

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.id);
  const decision = failedChecks.length === 0 ? 'advance' : 'rollback';
  const payload = {
    rolloutId: plan.rolloutId,
    planHash: plan.planHash,
    evaluatedAt: evaluatedAt.toISOString(),
    currentPercent,
    requestedPercent,
    decision,
    checks,
  };
  return Object.freeze({
    ...payload,
    failedChecks,
    nextPercent: decision === 'advance' ? requestedPercent : currentPercent,
    rollbackArtifactDigest: decision === 'rollback' ? plan.rollbackArtifactDigest : null,
    decisionHash: hash(payload),
  });
}

export function verifyRolloutPlan(plan) {
  assertObject(plan, 'rollout plan');
  const { planHash, ...payload } = plan;
  if (!SHA256.test(String(planHash ?? ''))) return false;
  const expected = Buffer.from(hash(payload), 'hex');
  const actual = Buffer.from(planHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyRolloutDecision(decision) {
  assertObject(decision, 'rollout decision');
  const { failedChecks: _failedChecks, nextPercent: _nextPercent, rollbackArtifactDigest: _rollbackArtifactDigest, decisionHash, ...payload } = decision;
  if (!SHA256.test(String(decisionHash ?? ''))) return false;
  return hash(payload) === decisionHash;
}
