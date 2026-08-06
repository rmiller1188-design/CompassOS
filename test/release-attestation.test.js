import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import {
  createReleaseCandidateReport,
  signReleaseAttestation,
  verifyReleaseAttestation,
} from '../src/operations/release-attestation.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function input(overrides = {}) {
  return {
    version: '0.23.0',
    commitSha: 'a'.repeat(40),
    readiness: { ready: true, disposition: 'reviewable-live' },
    evidenceLedger: { ready: true, disposition: 'reviewable-live', ledgerHash: 'b'.repeat(64) },
    migrationManifestHash: 'c'.repeat(64),
    artifacts: [
      { name: 'source.zip', digest: sha256('source'), mediaType: 'application/zip' },
      { name: 'review.md', digest: sha256('review'), mediaType: 'text/markdown' },
    ],
    generatedAt: '2026-08-06T21:00:00.000Z',
    ...overrides,
  };
}

test('creates deterministic release-candidate report with sorted artifacts', () => {
  const report = createReleaseCandidateReport(input({ artifacts: [...input().artifacts].reverse() }));
  assert.equal(report.disposition, 'release-candidate');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.artifacts.map((item) => item.name), ['review.md', 'source.zip']);
  assert.match(report.attestationDigest, /^[a-f0-9]{64}$/);
  assert.equal(report.attestationDigest, createReleaseCandidateReport(input()).attestationDigest);
});

test('blocks a report when readiness or evidence is not live-reviewable', () => {
  const report = createReleaseCandidateReport(input({
    readiness: { ready: false, disposition: 'infrastructure-blocked' },
    evidenceLedger: { ready: false, disposition: 'infrastructure-blocked', ledgerHash: 'b'.repeat(64) },
  }));
  assert.equal(report.disposition, 'blocked');
  assert.deepEqual(report.blockers, ['production-readiness', 'validation-evidence']);
  assert.throws(() => signReleaseAttestation({ report, privateKey, keyId: 'release-2026-01' }), /cannot be signed/);
});

test('signs and verifies an eligible report with Ed25519', () => {
  const report = createReleaseCandidateReport(input());
  const attestation = signReleaseAttestation({ report, privateKey, keyId: 'release-2026-01' });
  assert.equal(attestation.algorithm, 'Ed25519');
  assert.equal(attestation.keyId, 'release-2026-01');
  assert.equal(verifyReleaseAttestation({ attestation, publicKey }), true);
});

test('rejects report mutation after signing', () => {
  const report = createReleaseCandidateReport(input());
  const attestation = signReleaseAttestation({ report, privateKey, keyId: 'release-2026-01' });
  const tampered = {
    ...attestation,
    report: { ...attestation.report, commitSha: 'd'.repeat(40) },
  };
  assert.equal(verifyReleaseAttestation({ attestation: tampered, publicKey }), false);
});

test('rejects signature verification under another public key', () => {
  const other = generateKeyPairSync('ed25519');
  const report = createReleaseCandidateReport(input());
  const attestation = signReleaseAttestation({ report, privateKey, keyId: 'release-2026-01' });
  assert.equal(verifyReleaseAttestation({ attestation, publicKey: other.publicKey }), false);
});

test('rejects duplicate artifact names and malformed digests', () => {
  assert.throws(() => createReleaseCandidateReport(input({
    artifacts: [
      { name: 'source.zip', digest: 'd'.repeat(64) },
      { name: 'source.zip', digest: 'e'.repeat(64) },
    ],
  })), /unique/);
  assert.throws(() => createReleaseCandidateReport(input({
    artifacts: [{ name: 'source.zip', digest: 'not-a-digest' }],
  })), /SHA-256/);
});

test('rejects sensitive metadata fields before release evidence is emitted', () => {
  const report = createReleaseCandidateReport(input());
  const unsafe = {
    ...report,
    artifacts: [{ ...report.artifacts[0], apiKey: 'do-not-emit' }],
  };
  unsafe.attestationDigest = sha256('fake');
  assert.throws(() => signReleaseAttestation({ report: unsafe, privateKey, keyId: 'release-2026-01' }), /digest verification failed|sensitive field/);
});
