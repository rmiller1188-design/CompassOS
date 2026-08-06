import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createValidationEvidenceLedger,
  verifyValidationEvidenceLedger,
} from '../src/operations/validation-evidence.js';

const requiredControls = ['supabase-rls', 'google-sync', 'microsoft-sync', 'openai-eval'];
const now = new Date('2026-08-06T15:00:00.000Z');

function evidence(overrides = {}) {
  return {
    id: 'ev-1',
    controlId: 'supabase-rls',
    status: 'passed',
    environment: 'staging',
    observedAt: '2026-08-06T14:00:00.000Z',
    expiresAt: '2026-08-07T14:00:00.000Z',
    commitSha: 'abc123',
    workflowRunId: '207',
    artifactDigest: 'sha256:artifact',
    ...overrides,
  };
}

test('ledger fails closed when required controls lack evidence', () => {
  const ledger = createValidationEvidenceLedger({
    entries: [evidence()],
    requiredControls,
    now,
  });
  assert.equal(ledger.ready, false);
  assert.equal(ledger.disposition, 'infrastructure-blocked');
  assert.deepEqual(ledger.blockedControlIds, ['google-sync', 'microsoft-sync', 'openai-eval']);
  assert.equal(verifyValidationEvidenceLedger(ledger), true);
});

test('latest evidence wins and failed evidence dominates disposition', () => {
  const ledger = createValidationEvidenceLedger({
    entries: [
      evidence({ id: 'old', status: 'passed', observedAt: '2026-08-06T12:00:00.000Z' }),
      evidence({ id: 'new', status: 'failed', observedAt: '2026-08-06T14:30:00.000Z' }),
    ],
    requiredControls: ['supabase-rls'],
    now,
  });
  assert.equal(ledger.disposition, 'failed');
  assert.deepEqual(ledger.failedControlIds, ['supabase-rls']);
});

test('expired evidence is blocked rather than passed', () => {
  const ledger = createValidationEvidenceLedger({
    entries: [evidence({ expiresAt: '2026-08-06T14:30:00.000Z' })],
    requiredControls: ['supabase-rls'],
    now,
  });
  assert.equal(ledger.ready, false);
  assert.deepEqual(ledger.blockedControlIds, ['supabase-rls']);
  assert.equal(ledger.results[0].expired, true);
});

test('complete current passed evidence becomes reviewable-live', () => {
  const entries = requiredControls.map((controlId, index) => evidence({
    id: `ev-${index}`,
    controlId,
  }));
  const ledger = createValidationEvidenceLedger({ entries, requiredControls, now });
  assert.equal(ledger.ready, true);
  assert.equal(ledger.disposition, 'reviewable-live');
});

test('ledger hash detects tampering and excludes secret material by contract', () => {
  const ledger = createValidationEvidenceLedger({
    entries: [evidence()],
    requiredControls: ['supabase-rls'],
    now,
  });
  const tampered = structuredClone(ledger);
  tampered.results[0].effectiveStatus = 'failed';
  assert.equal(verifyValidationEvidenceLedger(tampered), false);
  assert.equal(JSON.stringify(ledger).includes('service-role-key'), false);
});

test('malformed, duplicate, and invalid expiration evidence is rejected', () => {
  assert.throws(() => createValidationEvidenceLedger({ entries: [], requiredControls: ['a', 'a'], now }));
  assert.throws(() => createValidationEvidenceLedger({
    entries: [evidence({ id: 'same' }), evidence({ id: 'same' })],
    requiredControls: ['supabase-rls'],
    now,
  }));
  assert.throws(() => createValidationEvidenceLedger({
    entries: [evidence({ expiresAt: '2026-08-06T13:00:00.000Z' })],
    requiredControls: ['supabase-rls'],
    now,
  }));
});
