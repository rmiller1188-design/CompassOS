const MAX_RETRY_AFTER_MS = 15 * 60_000;
const TRANSIENT_STATUSES = new Set([408, 425, 429]);
const NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED']);

function finiteStatus(value) {
  const status = Number(value || 0);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
}

function safeProviderCode(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const code = String(value).trim();
  if (!code) return null;
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(code) ? code : null;
}

export function parseProviderRetryAfter(value, { now = new Date(), maxMs = MAX_RETRY_AFTER_MS } = {}) {
  if (value == null || value === '') return null;
  if (!Number.isFinite(maxMs) || maxMs <= 0) throw new TypeError('Maximum Retry-After must be positive');
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(maxMs, Math.ceil(seconds * 1000));
  }

  const base = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(base.getTime())) throw new TypeError('Retry-After reference time must be valid');
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.min(maxMs, Math.max(0, date.getTime() - base.getTime()));
}

export function createReconciliationProviderError(response, payload = {}, { now = new Date() } = {}) {
  const status = finiteStatus(response?.status);
  const providerCode = safeProviderCode(payload?.error?.code ?? payload?.error ?? payload?.code);
  const retryAfterMs = parseProviderRetryAfter(response?.headers?.get?.('retry-after'), { now });

  let code = 'PROVIDER_REQUEST_REJECTED';
  let message = status ? `Provider reconciliation request failed with HTTP ${status}` : 'Provider reconciliation request failed';
  if (status === 401 || status === 403) {
    code = 'PROVIDER_AUTH_REQUIRED';
    message = 'Provider reconciliation authorization is no longer valid';
  } else if (status === 429) {
    code = 'PROVIDER_RATE_LIMITED';
    message = 'Provider reconciliation request was rate limited';
  } else if (TRANSIENT_STATUSES.has(status) || status >= 500) {
    code = 'PROVIDER_TRANSIENT';
    message = 'Provider reconciliation request failed transiently';
  }

  const error = new Error(message);
  error.name = 'ReconciliationProviderError';
  error.code = code;
  error.status = status || null;
  error.retryAfterMs = retryAfterMs;
  error.providerCode = providerCode;
  return error;
}

export function classifyReconciliationProviderError(error) {
  const status = finiteStatus(error?.status ?? error?.statusCode);
  const code = String(error?.code || '');
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs >= 0
    ? Math.min(MAX_RETRY_AFTER_MS, Math.ceil(error.retryAfterMs))
    : null;

  if (code === 'PROVIDER_AUTH_REQUIRED' || status === 401 || status === 403) {
    return Object.freeze({ disposition: 'manual_review', resolutionCode: 'PROVIDER_RECONNECT_REQUIRED', retryAfterMs: null });
  }

  if (
    code === 'PROVIDER_RATE_LIMITED' ||
    code === 'PROVIDER_TRANSIENT' ||
    TRANSIENT_STATUSES.has(status) ||
    status >= 500 ||
    retryAfterMs !== null ||
    NETWORK_CODES.has(code)
  ) {
    return Object.freeze({ disposition: 'retry_later', resolutionCode: 'PROVIDER_LOOKUP_TRANSIENT', retryAfterMs });
  }

  return Object.freeze({ disposition: 'manual_review', resolutionCode: 'PROVIDER_LOOKUP_FAILED', retryAfterMs: null });
}

export function getReconciliationProviderErrorPolicy() {
  return Object.freeze({ maxRetryAfterMs: MAX_RETRY_AFTER_MS });
}
