import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReleaseCandidate,
  evaluateReleasePromotion,
  verifyPromotionReport,
  verifyReleaseCandidate,
} from '../src/operations/release-promotion.js';

const digest = (character) => character.repeat(64);
const commitSha = 'a1a361fa0e36cb5776eb3a2244418efed6bf44bf';
const now = new Date('2026-08-06T17:00:00.000Z');

function candidate(overrides = {}) {
  return createReleaseCandidate({
    releaseId: 'p7c-2026-08-06',
    targetEnvironment: 'production',
    commitSha,
    artifactDigest: digest('a'),
    migrationManifestHash: digest('b'),
    evidenceLedgerHash: digest('c'),
    createdAt: '2026-08-06T16:00:00.000Z',
    ...overrides,
  });
}

function readiness(overrides = {}) {
  return {
    ready: true,
    disposition: 'reviewable-live',
    migrations: { ready: true, manifestHash: digest('b') },
    ...overrides,
  };
}

function ledger(overrides = {}) {
  return {
    ready: true,
    disposition: 'reviewable-live',
    ledgerHash: digest('c'),
    results: [{
      controlId: 'supabase-rls',
      effectiveStatus: 'passed',
      evidence: { commitSha },
    }],
    ...overrides,
  };
}

function approval(releaseCandidate, overrides = {}) {
  return {
    approverId: 'release-owner',
    approvedAt: '2026-08-06T16:30:00.000Z',
    candidateHash: releaseCandidate.candidateHash,
    decision: 'approved',
    ...overrides,
  };
}

test('complete bound evidence and current approval permits promotion', () => {
  const releaseCandidate = candidate();
  const report = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(releaseCandidate)],
    now,
  });
  assert.equal(report.promotable, true);
  assert.equal(report.disposition, 'promotion-approved');
  assert.deepEqual(report.failedChecks, []);
  assert.equal(verifyReleaseCandidate(releaseCandidate), true);
  assert.equal(verifyPromotionReport(report), true);
});

test('candidate mutation invalidates manifest and prior approval', () => {
  const original = candidate();
  const tampered = { ...original, artifactDigest: digest('d') };
  const report = evaluateReleasePromotion({
    candidate: tampered,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(original)],
    now,
  });
  assert.equal(verifyReleaseCandidate(tampered), false);
  assert.equal(report.promotable, false);
  assert.ok(report.failedChecks.includes('candidate-hash-valid'));
  assert.ok(report.failedChecks.includes('approval-threshold'));
});

test('migration, ledger, and commit mismatches fail closed', () => {
  const releaseCandidate = candidate();
  const report = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness({ migrations: { ready: true, manifestHash: digest('e') } }),
    evidenceLedger: ledger({ ledgerHash: digest('f'), results: [{ evidence: { commitSha: 'abcdef1' } }] }),
    approvals: [approval(releaseCandidate)],
    now,
  });
  assert.deepEqual(report.failedChecks.sort(), [
    'evidence-commit-bound',
    'ledger-hash-bound',
    'migration-hash-bound',
  ]);
});

test('blocked readiness or evidence cannot be promoted', () => {
  const releaseCandidate = candidate();
  const report = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness({ ready: false, disposition: 'infrastructure-blocked' }),
    evidenceLedger: ledger({ ready: false, disposition: 'infrastructure-blocked' }),
    approvals: [approval(releaseCandidate)],
    now,
  });
  assert.equal(report.promotable, false);
  assert.ok(report.failedChecks.includes('readiness-passed'));
  assert.ok(report.failedChecks.includes('ledger-ready'));
});

test('expired approval, current rejection, and duplicate approvers are rejected', () => {
  const releaseCandidate = candidate();
  const expired = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(releaseCandidate, { approvedAt: '2026-08-04T16:00:00.000Z' })],
    now,
  });
  assert.ok(expired.failedChecks.includes('approval-threshold'));

  const rejected = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(releaseCandidate, { decision: 'rejected' })],
    now,
  });
  assert.ok(rejected.failedChecks.includes('no-current-rejection'));

  assert.throws(() => evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(releaseCandidate), approval(releaseCandidate)],
    now,
  }));
});

test('malformed candidate, approval threshold, and report tampering are rejected', () => {
  assert.throws(() => candidate({ targetEnvironment: 'development' }));
  assert.throws(() => candidate({ artifactDigest: 'not-a-digest' }));
  const releaseCandidate = candidate();
  assert.throws(() => evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [],
    requiredApprovals: 0,
    now,
  }));

  const report = evaluateReleasePromotion({
    candidate: releaseCandidate,
    readiness: readiness(),
    evidenceLedger: ledger(),
    approvals: [approval(releaseCandidate)],
    now,
  });
  const tampered = structuredClone(report);
  tampered.checks[0].passed = false;
  assert.equal(verifyPromotionReport(tampered), false);
});
