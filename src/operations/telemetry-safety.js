import { createHash } from 'node:crypto';

const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|cookie|set-cookie|password|secret|api[_-]?key|client[_-]?secret|code[_-]?verifier|session[_-]?token|credential)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const QUERY_SECRET_PATTERN = /([?&](?:access_token|refresh_token|id_token|code|client_secret)=)[^&#\s]*/gi;
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 4096;

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

export function telemetryAccountRef(accountId) {
  const value = requireString(accountId, 'Account id');
  return `acct_${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

export function sanitizeTelemetry(value, { maxDepth = MAX_DEPTH, maxStringLength = MAX_STRING_LENGTH } = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new TypeError('maxDepth must be an integer from 1 to 32');
  if (!Number.isInteger(maxStringLength) || maxStringLength < 128 || maxStringLength > 65536) throw new TypeError('maxStringLength must be an integer from 128 to 65536');
  return sanitizeValue(value, { depth: 0, maxDepth, maxStringLength, seen: new WeakSet() });
}

function sanitizeValue(value, context) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value, context.maxStringLength);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return '[OMITTED]';

  if (context.depth >= context.maxDepth) return '[MAX_DEPTH]';
  if (context.seen.has(value)) return '[CIRCULAR]';
  context.seen.add(value);

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[INVALID_DATE]' : value.toISOString();
  if (value instanceof URL) return redactString(value.toString(), context.maxStringLength);
  if (value instanceof Error) {
    return sanitizeValue({
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
      retryAfter: value.retryAfter,
    }, nextContext(context));
  }

  if (isContainedProviderSession(value)) {
    return Object.freeze({
      provider: value.provider,
      accountRef: telemetryAccountRef(value.accountId),
      credential: 'ephemeral',
      credentialMode: 'capability-only',
      capabilityUseMode: 'single-use',
    });
  }

  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, nextContext(context)));
  if (value instanceof Map) {
    return sanitizeValue(Object.fromEntries([...value.entries()].map(([key, entry]) => [String(key), entry])), nextContext(context));
  }
  if (value instanceof Set) return sanitizeValue([...value.values()], nextContext(context));

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeValue(entry, nextContext(context));
  }
  return sanitized;
}

function nextContext(context) {
  return { ...context, depth: context.depth + 1 };
}

function isContainedProviderSession(value) {
  return value
    && typeof value === 'object'
    && typeof value.provider === 'string'
    && typeof value.accountId === 'string'
    && value.credentialMode === 'capability-only'
    && value.capabilityUseMode === 'single-use'
    && !('accessToken' in value)
    && typeof value.withAccessToken === 'function';
}

function redactString(value, maxStringLength) {
  const truncated = value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…[TRUNCATED]` : value;
  return truncated
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_PATTERN, '[JWT_REDACTED]')
    .replace(QUERY_SECRET_PATTERN, '$1[REDACTED]');
}

export function createWorkerTelemetryEvent({
  event,
  subsystem,
  occurredAt = new Date().toISOString(),
  actionId = null,
  providerSession = null,
  metadata = {},
}) {
  const timestamp = new Date(occurredAt);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('occurredAt must be a valid date');

  const output = {
    schemaVersion: 1,
    event: requireString(event, 'Telemetry event'),
    subsystem: requireString(subsystem, 'Telemetry subsystem'),
    occurredAt: timestamp.toISOString(),
    actionId: actionId === null ? null : requireString(actionId, 'Action id'),
    provider: null,
    accountRef: null,
    metadata: sanitizeTelemetry(metadata),
  };

  if (providerSession !== null) {
    if (!isContainedProviderSession(providerSession)) throw new TypeError('Capability-only single-use contained provider session is required');
    output.provider = requireString(providerSession.provider, 'Provider');
    output.accountRef = telemetryAccountRef(providerSession.accountId);
  }

  return Object.freeze(output);
}
