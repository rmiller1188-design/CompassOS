import { assertContainedProviderSession } from './provider-session-credential.js';

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function purposeMismatchError() {
  const error = new Error('Provider credential capability purpose binding mismatch');
  error.code = 'PROVIDER_CREDENTIAL_PURPOSE_MISMATCH';
  return error;
}

export function createPurposeBoundProviderSession({ session, purpose, subjectId }) {
  const contained = assertContainedProviderSession(session);
  const boundPurpose = requireString(purpose, 'Provider credential purpose');
  const boundSubjectId = requireString(subjectId, 'Provider credential subject id');

  const wrapped = {};
  Object.defineProperties(wrapped, {
    provider: { value: contained.provider, enumerable: true, writable: false, configurable: false },
    accountId: { value: contained.accountId, enumerable: true, writable: false, configurable: false },
    credentialMode: { value: 'capability-only', enumerable: true, writable: false, configurable: false },
    capabilityUseMode: { value: 'single-use', enumerable: true, writable: false, configurable: false },
    purposeBindingMode: { value: 'exact', enumerable: false, writable: false, configurable: false },
    purpose: { value: boundPurpose, enumerable: false, writable: false, configurable: false },
    subjectId: { value: boundSubjectId, enumerable: false, writable: false, configurable: false },
    withAccessToken: {
      value: async (callback) => contained.withAccessToken(callback),
      enumerable: false,
      writable: false,
      configurable: false,
    },
    toJSON: {
      value: () => ({
        provider: contained.provider,
        accountId: contained.accountId,
        credential: 'ephemeral',
        credentialMode: 'capability-only',
        capabilityUseMode: 'single-use',
      }),
      enumerable: false,
      writable: false,
      configurable: false,
    },
  });
  return Object.freeze(wrapped);
}

export function assertPurposeBoundProviderSession(session, { purpose, subjectId, provider, accountId } = {}) {
  const contained = assertContainedProviderSession(session, { provider, accountId });
  if (session.purposeBindingMode !== 'exact') throw new Error('Exact provider credential purpose binding is required');
  const actualPurpose = requireString(session.purpose, 'Provider credential purpose');
  const actualSubjectId = requireString(session.subjectId, 'Provider credential subject id');
  if (purpose !== undefined && actualPurpose !== requireString(purpose, 'Expected provider credential purpose')) throw purposeMismatchError();
  if (subjectId !== undefined && actualSubjectId !== requireString(subjectId, 'Expected provider credential subject id')) throw purposeMismatchError();
  return contained;
}
