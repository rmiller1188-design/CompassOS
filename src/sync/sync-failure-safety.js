const MAX_RETRY_AFTER_MS = 15 * 60 * 1000;
const MIN_RETRY_AFTER_MS = 1000;

const SAFE_REASON_MESSAGES = Object.freeze({
  reauthorization_required: "Provider reauthorization is required",
  rate_limited: "Provider rate limit delayed synchronization",
  provider_transient: "Provider synchronization is temporarily unavailable",
  sync_control_transient: "Synchronization ownership or control is temporarily unavailable",
  sync_invariant: "Synchronization invariant rejected provider progress",
  provider_rejected: "Provider rejected synchronization request",
  sync_failure: "Synchronization failed",
});

function boundedRetryAfterMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return MIN_RETRY_AFTER_MS;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, Math.trunc(numeric)));
}

export function createSafeSyncFailureRecord(failure = {}) {
  const requestedReason = typeof failure?.reason === "string" ? failure.reason : "sync_failure";
  const reason = Object.hasOwn(SAFE_REASON_MESSAGES, requestedReason) ? requestedReason : "sync_failure";
  const retryable = failure?.retryable === true;

  return Object.freeze({
    retryable,
    reason,
    message: SAFE_REASON_MESSAGES[reason],
    ...(retryable ? { retryAfterMs: boundedRetryAfterMs(failure?.retryAfterMs) } : {}),
  });
}

export const syncFailureSafetyPolicy = Object.freeze({
  maxRetryAfterMs: MAX_RETRY_AFTER_MS,
  minRetryAfterMs: MIN_RETRY_AFTER_MS,
  allowedReasons: Object.freeze(Object.keys(SAFE_REASON_MESSAGES)),
  persistsRawProviderMessage: false,
});
