import { createHash, sign, verify } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const FORBIDDEN_KEYS = /(secret|token|password|private.?key|service.?role|api.?key|authorization|cookie)/i;

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

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function assertNoSensitiveKeys(value, path = 'attestation') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new TypeError(`sensitive field is not allowed: ${path}.${key}`);
    assertNoSensitiveKeys(nested, `${path}.${key}`);
  }
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new TypeError('artifacts must be a non-empty array');
  }
  const normalized = artifacts.map((artifact) => {
    assertObject(artifact, 'artifact');
    if (!artifact.name || !artifact.digest || !SHA256.test(String(artifact.digest))) {
      throw new TypeError('artifact requires name and lowercase SHA-256 digest');
    }
    return Object.freeze({
      name: String(artifact.name),
      digest: String(artifact.digest),
      mediaType: artifact.mediaType ? String(artifact.mediaType) : 'application/octet-stream',
    });
  }).sort((a, b) => a.name.localeCompare(b.name));
  const names = normalized.map((artifact) => artifact.name);
  if (new Set(names).size !== names.length) throw new TypeError('artifact names must be unique');
  return normalized;
}

export function createReleaseCandidateReport({
  version,
  commitSha,
  readiness,
  evidenceLedger,
  migrationManifestHash,
  artifacts,
  generatedAt = new Date(),
}) {
  if (!version || typeof version !== 'string') throw new TypeError('version is required');
  if (!COMMIT_SHA.test(String(commitSha))) throw new TypeError('commitSha must be a lowercase 40-character SHA');
  if (!SHA256.test(String(migrationManifestHash))) throw new TypeError('migrationManifestHash must be a lowercase SHA-256 digest');
  assertObject(readiness, 'readiness');
  assertObject(evidenceLedger, 'evidenceLedger');
  if (!SHA256.test(String(evidenceLedger.ledgerHash))) throw new TypeError('evidenceLedger.ledgerHash must be a SHA-256 digest');

  const timestamp = new Date(generatedAt);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('generatedAt must be a valid date');
  const normalizedArtifacts = normalizeArtifacts(artifacts);
  const blockers = [
    ...(readiness.ready === true ? [] : ['production-readiness']),
    ...(evidenceLedger.ready === true && evidenceLedger.disposition === 'reviewable-live' ? [] : ['validation-evidence']),
  ];

  const payload = {
    schemaVersion: 1,
    version,
    commitSha: String(commitSha),
    generatedAt: timestamp.toISOString(),
    disposition: blockers.length === 0 ? 'release-candidate' : 'blocked',
    blockers,
    readinessDisposition: String(readiness.disposition ?? 'unknown'),
    evidenceDisposition: String(evidenceLedger.disposition ?? 'unknown'),
    evidenceLedgerHash: String(evidenceLedger.ledgerHash),
    migrationManifestHash: String(migrationManifestHash),
    artifacts: normalizedArtifacts,
  };
  assertNoSensitiveKeys(payload);
  return Object.freeze({ ...payload, attestationDigest: digest(payload) });
}

export function signReleaseAttestation({ report, privateKey, keyId }) {
  assertObject(report, 'report');
  if (report.disposition !== 'release-candidate' || report.blockers?.length) {
    throw new Error('blocked release reports cannot be signed');
  }
  if (!keyId || typeof keyId !== 'string') throw new TypeError('keyId is required');
  if (!SHA256.test(String(report.attestationDigest))) throw new TypeError('report attestationDigest is invalid');
  const { attestationDigest, ...payload } = report;
  if (digest(payload) !== attestationDigest) throw new Error('report digest verification failed');
  assertNoSensitiveKeys(payload);

  const signature = sign(null, Buffer.from(attestationDigest, 'hex'), privateKey).toString('base64url');
  return Object.freeze({
    algorithm: 'Ed25519',
    keyId,
    attestationDigest,
    signature,
    report: Object.freeze({ ...payload, attestationDigest }),
  });
}

export function verifyReleaseAttestation({ attestation, publicKey }) {
  assertObject(attestation, 'attestation');
  assertObject(attestation.report, 'attestation.report');
  if (attestation.algorithm !== 'Ed25519') return false;
  const { attestationDigest, ...payload } = attestation.report;
  if (!SHA256.test(String(attestationDigest)) || digest(payload) !== attestationDigest) return false;
  if (attestation.attestationDigest !== attestationDigest) return false;
  if (payload.disposition !== 'release-candidate' || payload.blockers?.length) return false;
  try {
    assertNoSensitiveKeys(payload);
    return verify(
      null,
      Buffer.from(attestationDigest, 'hex'),
      publicKey,
      Buffer.from(String(attestation.signature), 'base64url'),
    );
  } catch {
    return false;
  }
}
