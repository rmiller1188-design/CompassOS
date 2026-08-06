import { createHash, timingSafeEqual } from 'node:crypto';

const TARGETS = new Set(['staging', 'production']);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{7,64}$/;

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
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

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function requireDigest(value, name) {
  const digest = requireString(value, name).replace(/^sha256:/, '');
  if (!SHA256.test(digest)) throw new TypeError(`${name} must be a SHA-256 digest`);
  return digest;
}

function normalizeApproval(approval, candidate) {
  assertObject(approval, 'approval');
  const approvedAt = new Date(approval.approvedAt);
  if (Number.isNaN(approvedAt.getTime())) throw new TypeError('approval approvedAt must be an ISO timestamp');
  const normalized = {
    approverId: requireString(approval.approverId, 'approval approverId'),
    approvedAt: approvedAt.toISOString(),
    candidateHash: requireDigest(approval.candidateHash, 'approval candidateHash'),
    decision: approval.decision,
  };
  if (!['approved', 'rejected'].includes(normalized.decision)) {
    throw new TypeError('approval decision must be approved or rejected');
  }
  return Object.freeze({
    ...normalized,
    current: normalized.candidateHash === candidate.candidateHash,
  });
}

export function createReleaseCandidate(input) {
  assertObject(input, 'release candidate');
  if (!TARGETS.has(input.targetEnvironment)) {
    throw new TypeError('targetEnvironment must be staging or production');
  }
  const commitSha = requireString(input.commitSha, 'commitSha').toLowerCase();
  if (!COMMIT_SHA.test(commitSha)) throw new TypeError('commitSha must be a hexadecimal Git commit SHA');
  const createdAt = new Date(input.createdAt ?? new Date());
  if (Number.isNaN(createdAt.getTime())) throw new TypeError('createdAt must be an ISO timestamp');

  const payload = {
    releaseId: requireString(input.releaseId, 'releaseId'),
    targetEnvironment: input.targetEnvironment,
    commitSha,
    artifactDigest: requireDigest(input.artifactDigest, 'artifactDigest'),
    migrationManifestHash: requireDigest(input.migrationManifestHash, 'migrationManifestHash'),
    evidenceLedgerHash: requireDigest(input.evidenceLedgerHash, 'evidenceLedgerHash'),
    createdAt: createdAt.toISOString(),
  };
  return Object.freeze({ ...payload, candidateHash: hash(payload) });
}

export function evaluateReleasePromotion({
  candidate,
  readiness,
  evidenceLedger,
  approvals = [],
  requiredApprovals = 1,
  now = new Date(),
  maxApprovalAgeMs = 24 * 60 * 60 * 1000,
}) {
  assertObject(candidate, 'candidate');
  assertObject(readiness, 'readiness');
  assertObject(evidenceLedger, 'evidenceLedger');
  if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1) {
    throw new TypeError('requiredApprovals must be a positive integer');
  }
  if (!Number.isFinite(maxApprovalAgeMs) || maxApprovalAgeMs <= 0) {
    throw new TypeError('maxApprovalAgeMs must be positive');
  }
  const evaluatedAt = new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new TypeError('now must be a valid date');

  const normalizedApprovals = approvals.map((approval) => normalizeApproval(approval, candidate));
  const approverIds = normalizedApprovals.map((approval) => approval.approverId);
  if (new Set(approverIds).size !== approverIds.length) {
    throw new TypeError('approverId values must be unique');
  }

  const checks = [];
  const addCheck = (id, passed, detail) => checks.push(Object.freeze({ id, passed: Boolean(passed), detail }));
  addCheck('candidate-hash-valid', verifyReleaseCandidate(candidate), 'candidate manifest integrity');
  addCheck('readiness-passed', readiness.disposition === 'passed', `readiness disposition: ${readiness.disposition}`);
  addCheck('migration-hash-bound', readiness.migrationManifestHash === candidate.migrationManifestHash, 'candidate migration manifest matches readiness evidence');
  addCheck('ledger-ready', evidenceLedger.ready === true && evidenceLedger.disposition === 'reviewable-live', `ledger disposition: ${evidenceLedger.disposition}`);
  addCheck('ledger-hash-bound', evidenceLedger.ledgerHash === candidate.evidenceLedgerHash, 'candidate evidence ledger hash matches');

  const ledgerCommits = evidenceLedger.results
    .map((result) => result?.evidence?.commitSha)
    .filter(Boolean);
  addCheck(
    'evidence-commit-bound',
    ledgerCommits.length > 0 && ledgerCommits.every((sha) => sha === candidate.commitSha),
    'all selected evidence is bound to the candidate commit',
  );

  const currentApprovals = normalizedApprovals.filter((approval) => approval.current);
  const rejected = currentApprovals.some((approval) => approval.decision === 'rejected');
  const validApprovals = currentApprovals.filter((approval) => {
    const age = evaluatedAt.getTime() - new Date(approval.approvedAt).getTime();
    return approval.decision === 'approved' && age >= 0 && age <= maxApprovalAgeMs;
  });
  addCheck('no-current-rejection', !rejected, 'no current approval rejects the candidate');
  addCheck('approval-threshold', validApprovals.length >= requiredApprovals, `${validApprovals.length}/${requiredApprovals} current approvals`);

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.id);
  const reportPayload = {
    releaseId: candidate.releaseId,
    targetEnvironment: candidate.targetEnvironment,
    candidateHash: candidate.candidateHash,
    evaluatedAt: evaluatedAt.toISOString(),
    requiredApprovals,
    validApproverIds: validApprovals.map((approval) => approval.approverId).sort(),
    checks,
  };
  return Object.freeze({
    ...reportPayload,
    promotable: failedChecks.length === 0,
    disposition: failedChecks.length === 0 ? 'promotion-approved' : 'promotion-blocked',
    failedChecks,
    reportHash: hash(reportPayload),
  });
}

export function verifyReleaseCandidate(candidate) {
  assertObject(candidate, 'candidate');
  const { candidateHash, ...payload } = candidate;
  if (!SHA256.test(String(candidateHash ?? ''))) return false;
  const expected = Buffer.from(hash(payload), 'hex');
  const actual = Buffer.from(candidateHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyPromotionReport(report) {
  assertObject(report, 'promotion report');
  const { promotable: _promotable, disposition: _disposition, failedChecks: _failedChecks, reportHash, ...payload } = report;
  if (!SHA256.test(String(reportHash ?? ''))) return false;
  return hash(payload) === reportHash;
}
