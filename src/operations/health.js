const HEALTH_STATES = new Set(['healthy', 'degraded', 'blocked', 'unknown']);
const RECOVERY_ACTIONS = new Set(['retry', 'reconnect', 'review', 'none']);
const SECRET_KEY_PATTERN = /(token|secret|authorization|cookie|password|api[-_]?key|code_verifier)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

export function createHealthSignal({
  subsystem,
  status,
  code,
  summary,
  occurredAt,
  accountId = null,
  provider = null,
  retryable = false,
  reconnectRequired = false,
  metadata = {}
}) {
  if (!subsystem || typeof subsystem !== 'string') throw new Error('subsystem is required');
  if (!HEALTH_STATES.has(status)) throw new Error(`invalid health status: ${status}`);
  if (!code || typeof code !== 'string') throw new Error('code is required');
  if (!summary || typeof summary !== 'string') throw new Error('summary is required');
  const timestamp = new Date(occurredAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error('occurredAt must be a valid date');

  return Object.freeze({
    subsystem,
    status,
    code,
    summary,
    occurredAt: timestamp.toISOString(),
    accountId,
    provider,
    retryable: Boolean(retryable),
    reconnectRequired: Boolean(reconnectRequired),
    metadata: redactDiagnostics(metadata)
  });
}

export function deriveRecoveryAction(signal) {
  if (!signal || !HEALTH_STATES.has(signal.status)) throw new Error('valid health signal is required');
  let action = 'none';
  if (signal.reconnectRequired) action = 'reconnect';
  else if (signal.retryable) action = 'retry';
  else if (signal.status === 'blocked' || signal.status === 'degraded') action = 'review';

  if (!RECOVERY_ACTIONS.has(action)) throw new Error('invalid recovery action');
  return Object.freeze({
    action,
    subsystem: signal.subsystem,
    accountId: signal.accountId,
    provider: signal.provider,
    reasonCode: signal.code,
    userMessage: recoveryMessage(action, signal.provider)
  });
}

export function buildOperationalHealth({ signals = [], now = new Date().toISOString() }) {
  const generatedAt = new Date(now);
  if (Number.isNaN(generatedAt.getTime())) throw new Error('now must be a valid date');

  const normalized = [...signals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const bySubsystem = new Map();
  for (const signal of normalized) {
    if (!bySubsystem.has(signal.subsystem)) bySubsystem.set(signal.subsystem, signal);
  }

  const latest = [...bySubsystem.values()];
  const overall = latest.some((item) => item.status === 'blocked')
    ? 'blocked'
    : latest.some((item) => item.status === 'degraded')
      ? 'degraded'
      : latest.length > 0 && latest.every((item) => item.status === 'healthy')
        ? 'healthy'
        : 'unknown';

  return Object.freeze({
    overall,
    generatedAt: generatedAt.toISOString(),
    subsystems: latest,
    recovery: latest
      .map(deriveRecoveryAction)
      .filter((item) => item.action !== 'none')
  });
}

export function createSupportExport({ ownerId, health, recentSignals = [], includeAccountIds = false }) {
  if (!ownerId) throw new Error('ownerId is required');
  if (!health || !HEALTH_STATES.has(health.overall)) throw new Error('health snapshot is required');

  const exportSignals = recentSignals.map((signal) => ({
    subsystem: signal.subsystem,
    status: signal.status,
    code: signal.code,
    summary: redactText(signal.summary),
    occurredAt: signal.occurredAt,
    provider: signal.provider,
    accountId: includeAccountIds ? signal.accountId : signal.accountId ? pseudonymize(signal.accountId) : null,
    retryable: signal.retryable,
    reconnectRequired: signal.reconnectRequired,
    metadata: redactDiagnostics(signal.metadata)
  }));

  return Object.freeze({
    schemaVersion: 1,
    owner: pseudonymize(ownerId),
    generatedAt: health.generatedAt,
    overall: health.overall,
    subsystemCount: health.subsystems.length,
    signals: exportSignals
  });
}

export function redactDiagnostics(value) {
  if (Array.isArray(value)) return value.map(redactDiagnostics);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactDiagnostics(entry)
    ]));
  }
  return typeof value === 'string' ? redactText(value) : value;
}

function redactText(value) {
  return value.replace(BEARER_PATTERN, 'Bearer [REDACTED]').replace(EMAIL_PATTERN, '[EMAIL]');
}

function pseudonymize(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `anon_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function recoveryMessage(action, provider) {
  const service = provider ? `${provider} account` : 'connection';
  if (action === 'reconnect') return `Reconnect the ${service} to resume protected sync.`;
  if (action === 'retry') return 'Retry the operation after the current provider or network issue clears.';
  if (action === 'review') return 'Review the affected operation before taking further action.';
  return 'No action is required.';
}
