const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;
const MIN_HEARTBEAT_INTERVAL_MS = 250;
const MAX_HEARTBEAT_INTERVAL_MS = 4_000;

function abortableWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('Lease heartbeat wait aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('Lease heartbeat wait aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function assertInterval(value) {
  if (!Number.isFinite(value) || value < MIN_HEARTBEAT_INTERVAL_MS || value > MAX_HEARTBEAT_INTERVAL_MS) {
    throw new TypeError(`heartbeatIntervalMs must be between ${MIN_HEARTBEAT_INTERVAL_MS} and ${MAX_HEARTBEAT_INTERVAL_MS}`);
  }
  return Math.ceil(value);
}

export async function runWithLeaseHeartbeat({
  operation,
  heartbeatLease,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  wait = abortableWait,
} = {}) {
  if (typeof operation !== 'function') throw new TypeError('operation is required');
  if (heartbeatLease == null) return operation({ signal: undefined });
  if (typeof heartbeatLease !== 'function') throw new TypeError('heartbeatLease must be a function');
  if (typeof wait !== 'function') throw new TypeError('wait must be a function');
  const intervalMs = assertInterval(heartbeatIntervalMs);

  const providerAbort = new AbortController();
  const heartbeatAbort = new AbortController();
  let settled = false;

  const providerPromise = Promise.resolve().then(() => operation({ signal: providerAbort.signal }));
  const heartbeatPromise = (async () => {
    while (!settled) {
      try {
        await wait(intervalMs, heartbeatAbort.signal);
      } catch (error) {
        if (settled || heartbeatAbort.signal.aborted) return undefined;
        throw error;
      }
      if (settled) return undefined;
      try {
        await heartbeatLease();
      } catch (error) {
        providerAbort.abort(error);
        throw error;
      }
    }
    return undefined;
  })();

  try {
    return await Promise.race([providerPromise, heartbeatPromise]);
  } finally {
    settled = true;
    heartbeatAbort.abort(new Error('Provider operation settled'));
  }
}

export function getLeaseGuardedOperationPolicy() {
  return Object.freeze({
    defaultHeartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    minHeartbeatIntervalMs: MIN_HEARTBEAT_INTERVAL_MS,
    maxHeartbeatIntervalMs: MAX_HEARTBEAT_INTERVAL_MS,
    providerCancellation: 'abort_signal',
    persistenceAfterLeaseLoss: 'forbidden',
  });
}
