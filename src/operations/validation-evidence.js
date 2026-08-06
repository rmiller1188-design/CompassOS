import { createHash } from 'node:crypto';

const STATUS = new Set(['passed', 'blocked', 'failed']);
const ENVIRONMENTS = new Set(['ci', 'staging', 'production']);

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

function normalizeEvidence(entry) {
  assertObject(entry, 'evidence');
  if (!entry.id || !entry.controlId || !STATUS.has(entry.status)) {
    throw new TypeError('evidence requires id, controlId, and passed|blocked|failed status');
  }
  if (!ENVIRONMENTS.has(entry.environment)) {
    throw new TypeError('evidence environment must be ci, staging, or production');
  }
  const observedAt = new Date(entry.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new TypeError('evidence observedAt must be an ISO timestamp');
  if (entry.expiresAt && new Date(entry.expiresAt) <= observedAt) {
    throw new TypeError('evidence expiresAt must be after observedAt');
  }

  const normalized = {
    id: String(entry.id),
    controlId: String(entry.controlId),
    status: entry.status,
    environment: entry.environment,
    observedAt: observedAt.toISOString(),
    expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
    commitSha: entry.commitSha ? String(entry.commitSha) : null,
    workflowRunId: entry.workflowRunId ? String(entry.workflowRunId) : null,
    artifactDigest: entry.artifactDigest ? String(entry.artifactDigest) : null,
    blockerCode: entry.blockerCode ? String(entry.blockerCode) : null,
  };
  return Object.freeze({ ...normalized, evidenceHash: hash(normalized) });
}

export function createValidationEvidenceLedger({ entries, requiredControls, now = new Date() }) {
  if (!Array.isArray(entries) || !Array.isArray(requiredControls)) {
    throw new TypeError('entries and requiredControls must be arrays');
  }
  const currentTime = new Date(now);
  if (Number.isNaN(currentTime.getTime())) throw new TypeError('now must be a valid date');
  const controls = [...new Set(requiredControls.map(String))].sort();
  if (controls.length !== requiredControls.length) throw new TypeError('requiredControls must be unique');

  const normalized = entries.map(normalizeEvidence);
  const ids = normalized.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('evidence ids must be unique');

  const latestByControl = new Map();
  for (const entry of normalized) {
    const previous = latestByControl.get(entry.controlId);
    if (!previous || entry.observedAt > previous.observedAt) latestByControl.set(entry.controlId, entry);
  }

  const results = controls.map((controlId) => {
    const entry = latestByControl.get(controlId) ?? null;
    const expired = Boolean(entry?.expiresAt && new Date(entry.expiresAt) <= currentTime);
    const effectiveStatus = !entry || expired ? 'blocked' : entry.status;
    return Object.freeze({ controlId, effectiveStatus, expired, evidence: entry });
  });
  const failed = results.filter((item) => item.effectiveStatus === 'failed').map((item) => item.controlId);
  const blocked = results.filter((item) => item.effectiveStatus === 'blocked').map((item) => item.controlId);
  const disposition = failed.length ? 'failed' : blocked.length ? 'infrastructure-blocked' : 'reviewable-live';
  const ledgerPayload = { generatedAt: currentTime.toISOString(), requiredControls: controls, results };

  return Object.freeze({
    ...ledgerPayload,
    disposition,
    ready: disposition === 'reviewable-live',
    failedControlIds: failed,
    blockedControlIds: blocked,
    ledgerHash: hash(ledgerPayload),
  });
}

export function verifyValidationEvidenceLedger(ledger) {
  assertObject(ledger, 'ledger');
  const payload = {
    generatedAt: ledger.generatedAt,
    requiredControls: ledger.requiredControls,
    results: ledger.results,
  };
  return hash(payload) === ledger.ledgerHash;
}
