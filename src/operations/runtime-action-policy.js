import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const PROVIDERS = new Set(['google', 'microsoft']);
const ACTION_TYPES = new Set([
  'mail.reply',
  'calendar.create',
  'calendar.update',
  'calendar.respond',
]);
const RULE_SCOPES = new Set(['global', 'provider', 'account', 'action']);

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

function requireIso(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be an ISO timestamp`);
  return date.toISOString();
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

function safeEqualDigest(left, right) {
  if (!SHA256.test(String(left ?? '')) || !SHA256.test(String(right ?? ''))) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function normalizeRule(rule) {
  assertObject(rule, 'rule');
  const scope = requireString(rule.scope, 'rule.scope');
  if (!RULE_SCOPES.has(scope)) throw new TypeError('rule.scope is unsupported');
  const normalized = {
    ruleId: requireString(rule.ruleId, 'rule.ruleId'),
    scope,
    reasonCode: requireString(rule.reasonCode, 'rule.reasonCode'),
    createdAt: requireIso(rule.createdAt, 'rule.createdAt'),
    expiresAt: rule.expiresAt == null ? null : requireIso(rule.expiresAt, 'rule.expiresAt'),
    provider: null,
    accountId: null,
    actionType: null,
  };

  if (scope === 'provider' || scope === 'account' || scope === 'action') {
    normalized.provider = requireString(rule.provider, 'rule.provider');
    if (!PROVIDERS.has(normalized.provider)) throw new TypeError('rule.provider is unsupported');
  }
  if (scope === 'account' || scope === 'action') {
    normalized.accountId = requireString(rule.accountId, 'rule.accountId');
  }
  if (scope === 'action') {
    normalized.actionType = requireString(rule.actionType, 'rule.actionType');
    if (!ACTION_TYPES.has(normalized.actionType)) throw new TypeError('rule.actionType is unsupported');
  }
  if (normalized.expiresAt && new Date(normalized.expiresAt) <= new Date(normalized.createdAt)) {
    throw new TypeError('rule.expiresAt must be after rule.createdAt');
  }
  return Object.freeze(normalized);
}

export function createRuntimeActionPolicy(input) {
  assertObject(input, 'policy');
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new TypeError('revision must be a positive integer');
  const generatedAt = requireIso(input.generatedAt ?? new Date(), 'generatedAt');
  const rules = (input.blockRules ?? []).map(normalizeRule);
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.ruleId)) throw new TypeError(`duplicate ruleId: ${rule.ruleId}`);
    ids.add(rule.ruleId);
  }
  const payload = {
    policyId: requireString(input.policyId, 'policyId'),
    revision: input.revision,
    generatedAt,
    defaultMode: 'approved-actions-only',
    blockRules: rules,
  };
  return Object.freeze({ ...payload, policyHash: hash(payload) });
}

export function verifyRuntimeActionPolicy(policy) {
  assertObject(policy, 'policy');
  const { policyHash, ...payload } = policy;
  return safeEqualDigest(policyHash, hash(payload));
}

function ruleMatches(rule, action, now) {
  if (rule.expiresAt && new Date(rule.expiresAt) <= now) return false;
  if (new Date(rule.createdAt) > now) return false;
  if (rule.scope === 'global') return true;
  if (rule.provider !== action.provider) return false;
  if (rule.scope === 'provider') return true;
  if (rule.accountId !== action.accountId) return false;
  if (rule.scope === 'account') return true;
  return rule.actionType === action.actionType;
}

function normalizeAction(action) {
  assertObject(action, 'action');
  const provider = requireString(action.provider, 'action.provider');
  if (!PROVIDERS.has(provider)) throw new TypeError('action.provider is unsupported');
  const actionType = requireString(action.actionType, 'action.actionType');
  if (!ACTION_TYPES.has(actionType)) throw new TypeError('action.actionType is unsupported');
  return {
    actionId: requireString(action.actionId, 'action.actionId'),
    ownerId: requireString(action.ownerId, 'action.ownerId'),
    accountId: requireString(action.accountId, 'action.accountId'),
    provider,
    actionType,
    state: requireString(action.state, 'action.state'),
    payloadRevision: action.payloadRevision,
    payloadHash: requireDigest(action.payloadHash, 'action.payloadHash'),
    approvedPayloadHash: action.approvedPayloadHash == null ? null : requireDigest(action.approvedPayloadHash, 'action.approvedPayloadHash'),
    approvalRevision: action.approvalRevision,
  };
}

export function evaluateRuntimeAction({ policy, action, now = new Date(), maxPolicyAgeMs = 15 * 60 * 1000 }) {
  if (!verifyRuntimeActionPolicy(policy)) throw new TypeError('policy integrity check failed');
  const normalized = normalizeAction(action);
  const evaluatedAt = new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new TypeError('now must be a valid date');
  if (!Number.isFinite(maxPolicyAgeMs) || maxPolicyAgeMs <= 0) throw new TypeError('maxPolicyAgeMs must be positive');

  const generatedAt = new Date(policy.generatedAt);
  const policyAgeMs = evaluatedAt.getTime() - generatedAt.getTime();
  const approvalBound = normalized.state === 'approved'
    && Number.isInteger(normalized.payloadRevision)
    && normalized.payloadRevision > 0
    && normalized.approvalRevision === normalized.payloadRevision
    && normalized.approvedPayloadHash != null
    && safeEqualDigest(normalized.payloadHash, normalized.approvedPayloadHash);

  const activeBlockRules = policy.blockRules
    .filter((rule) => ruleMatches(rule, normalized, evaluatedAt))
    .map((rule) => ({ ruleId: rule.ruleId, scope: rule.scope, reasonCode: rule.reasonCode }));

  const checks = [
    { id: 'policy-current', passed: policyAgeMs >= 0 && policyAgeMs <= maxPolicyAgeMs },
    { id: 'approval-bound', passed: approvalBound },
    { id: 'no-active-block', passed: activeBlockRules.length === 0 },
  ].map((check) => Object.freeze(check));
  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.id);
  const decision = failedChecks.length === 0 ? 'allow' : 'block';
  const payload = {
    policyId: policy.policyId,
    policyRevision: policy.revision,
    policyHash: policy.policyHash,
    actionId: normalized.actionId,
    ownerId: normalized.ownerId,
    accountId: normalized.accountId,
    provider: normalized.provider,
    actionType: normalized.actionType,
    payloadRevision: normalized.payloadRevision,
    payloadHash: normalized.payloadHash,
    evaluatedAt: evaluatedAt.toISOString(),
    decision,
    checks,
    activeBlockRules,
  };
  return Object.freeze({ ...payload, failedChecks, decisionHash: hash(payload) });
}

export function verifyRuntimeActionDecision(decision) {
  assertObject(decision, 'decision');
  const { failedChecks: _failedChecks, decisionHash, ...payload } = decision;
  return safeEqualDigest(decisionHash, hash(payload));
}
