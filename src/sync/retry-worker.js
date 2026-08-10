import { createSafeSyncFailureRecord } from "./sync-failure-safety.js";

function createRetryControlError(code, message, { retryable = true, retryAfterMs = 5_000 } = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  if (retryable) error.retryAfterMs = retryAfterMs;
  return error;
}

function assertResult(result, operation) {
  if (result?.error) {
    throw createRetryControlError("SYNC_RETRY_BACKEND", `${operation} failed`);
  }
  return result?.data;
}

function assertClaimedJob(job, workerId) {
  if (!job?.id || !job?.lease_token || job?.lease_owner !== workerId) {
    throw createRetryControlError("SYNC_RETRY_CLAIM_INVALID", "Retry claim did not return complete lease ownership", { retryable: false });
  }
  return job;
}

export function computeBackoffMs(attempt, { baseMs = 1000, maxMs = 15 * 60 * 1000 } = {}) {
  const safeAttempt = Math.max(1, Number(attempt || 1));
  return Math.min(maxMs, baseMs * (2 ** (safeAttempt - 1)));
}

function createSafeRetryFailure(job, attempts) {
  return createSafeSyncFailureRecord({
    retryable: true,
    reason: job?.reason,
    retryAfterMs: computeBackoffMs(attempts),
  });
}

export function createRetryWorker({ client, execute, workerId, now = () => new Date(), maxAttempts = 5, leaseSeconds = 120 }) {
  if (!client?.rpc) throw new TypeError("Supabase service-role client with rpc() is required");
  if (typeof execute !== "function") throw new TypeError("Retry executor is required");
  if (!workerId) throw new TypeError("Stable worker identifier is required");

  async function claim(limit = 10) {
    const result = await client.rpc("claim_sync_retry_jobs", {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(100, Number(limit || 10))),
      p_lease_seconds: leaseSeconds,
    });
    const jobs = assertResult(result, "Retry claim") || [];
    if (!Array.isArray(jobs)) throw createRetryControlError("SYNC_RETRY_CLAIM_INVALID", "Retry claim returned an invalid payload", { retryable: false });
    return jobs.map((job) => assertClaimedJob(job, workerId));
  }

  async function finalize(job, { outcome, attempts = null, reason = null, lastError = null, availableAt = null, completedAt = null }) {
    const result = await client.rpc("finalize_sync_retry_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_token: job.lease_token,
      p_outcome: outcome,
      p_attempts: attempts,
      p_reason: reason,
      p_last_error: lastError,
      p_available_at: availableAt,
      p_completed_at: completedAt,
    });
    const saved = assertResult(result, "Retry finalization");
    if (saved !== true) {
      throw createRetryControlError("SYNC_RETRY_LEASE_LOST", "Retry lease no longer authorizes finalization");
    }
    return true;
  }

  async function succeed(job) {
    return finalize(job, {
      outcome: "succeeded",
      completedAt: now().toISOString(),
    });
  }

  async function fail(job) {
    const attempts = Number(job.attempts || 0) + 1;
    const failure = createSafeRetryFailure(job, attempts);
    if (attempts >= maxAttempts) {
      await finalize(job, {
        outcome: "dead_lettered",
        attempts,
        reason: failure.reason,
        lastError: failure.message,
        completedAt: now().toISOString(),
      });
      return "dead_lettered";
    }

    await finalize(job, {
      outcome: "pending",
      attempts,
      reason: failure.reason,
      lastError: failure.message,
      availableAt: new Date(now().getTime() + failure.retryAfterMs).toISOString(),
    });
    return "rescheduled";
  }

  return {
    async runOnce({ limit = 10 } = {}) {
      const jobs = await claim(limit);
      const summary = { claimed: jobs.length, succeeded: 0, rescheduled: 0, deadLettered: 0, fenced: 0 };
      for (const job of jobs) {
        let executionFailed = false;
        try {
          await execute(job);
        } catch {
          executionFailed = true;
        }

        try {
          if (!executionFailed) {
            await succeed(job);
            summary.succeeded += 1;
            continue;
          }
          const outcome = await fail(job);
          if (outcome === "dead_lettered") summary.deadLettered += 1;
          else summary.rescheduled += 1;
        } catch (error) {
          if (error?.code === "SYNC_RETRY_LEASE_LOST") {
            summary.fenced += 1;
            continue;
          }
          throw error;
        }
      }
      return Object.freeze(summary);
    },
  };
}
