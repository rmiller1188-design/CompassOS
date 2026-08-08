import { createContainedProviderSession } from './provider-session-credential.js';

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

export class ReconciliationProviderSessionError extends Error {
  constructor(message, { code = 'PROVIDER_SESSION_FAILED', retryable = false, retryAfterMs = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ReconciliationProviderSessionError';
    this.code = code;
    this.retryable = Boolean(retryable);
    this.retryAfterMs = Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : null;
  }
}

function classifySessionError(error) {
  if (error instanceof ReconciliationProviderSessionError) return error;
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || 'PROVIDER_SESSION_FAILED');
  const retryAfterMs = Number(error?.retryAfterMs || 0) || null;
  const retryable = Boolean(error?.retryable) || status === 408 || status === 425 || status === 429 || status >= 500 || retryAfterMs !== null || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code);
  if (retryable) {
    return new ReconciliationProviderSessionError('Provider session refresh is temporarily unavailable', {
      code: 'PROVIDER_SESSION_REFRESH_TRANSIENT',
      retryable: true,
      retryAfterMs,
      cause: error,
    });
  }
  return new ReconciliationProviderSessionError('Provider reconnect is required before reconciliation can continue', {
    code: 'PROVIDER_RECONNECT_REQUIRED',
    retryable: false,
    cause: error,
  });
}

function assertBoundContext(context) {
  const reconciliation = context?.reconciliation;
  const account = context?.account;
  if (!reconciliation || reconciliation.status !== 'pending') throw new ReconciliationProviderSessionError('Pending reconciliation context is required', { code: 'RECONCILIATION_CONTEXT_INVALID' });
  const actionId = requireString(reconciliation.actionId, 'Action id');
  const userId = requireString(reconciliation.userId, 'User id');
  const accountId = requireString(reconciliation.accountId, 'Account id');
  const provider = requireString(reconciliation.provider, 'Provider');
  if (!account || requireString(account.id, 'Account id') !== accountId || requireString(account.provider, 'Account provider') !== provider) {
    throw new ReconciliationProviderSessionError('Connected account does not match reconciliation case', { code: 'RECONCILIATION_CONTEXT_INVALID' });
  }
  if (account.status === 'disconnected' || account.status === 'reauthorization_required') {
    throw new ReconciliationProviderSessionError('Provider reconnect is required before reconciliation can continue', { code: 'PROVIDER_RECONNECT_REQUIRED' });
  }
  if (account.userId && account.userId !== userId) {
    throw new ReconciliationProviderSessionError('Connected account owner does not match reconciliation case', { code: 'RECONCILIATION_CONTEXT_INVALID' });
  }
  return { actionId, userId, accountId, provider };
}

export function createOAuthReconciliationSessionPreparer({ oauthService }) {
  if (!oauthService?.getValidAccessToken) throw new TypeError('OAuth application service is required');
  return async function prepareReconciliationProviderSession(context) {
    const binding = assertBoundContext(context);
    let accessToken;
    try {
      accessToken = await oauthService.getValidAccessToken({ userId: binding.userId, accountId: binding.accountId });
    } catch (error) {
      throw classifySessionError(error);
    }
    requireString(accessToken, 'Provider access token');
    return Object.freeze({
      ...context,
      providerSession: createContainedProviderSession({
        provider: binding.provider,
        accountId: binding.accountId,
        accessToken,
      }),
    });
  };
}

export function classifyReconciliationProviderSessionError(error) {
  const classified = classifySessionError(error);
  return Object.freeze({
    disposition: classified.retryable ? 'retry_later' : 'manual_review',
    resolutionCode: classified.code,
    retryAfterMs: classified.retryAfterMs,
  });
}
