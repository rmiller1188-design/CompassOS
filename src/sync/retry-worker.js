function assertResult(result, operation) {
  if (result?.error) {
    const error = new Error(`${operation}: ${result.error.message || "Supabase operation failed"}`);
    error.code = result.error.code;
    error.status = result.status;
    throw error;
  }
  return result?.data;
}

export function computeBackoffMs(attempt, { baseMs = 1000, maxMs = 15 * 60 * 1000 } = {}) {
  const safeAttempt = Math.max(1, Number(attempt || 1));
  return Math.min(maxMs, baseMs * (2 ** (safeAttempt - 1)));
}

export function createRetryWorker({ client, execute, workerId, now = () => new Date(), maxAttempts = 5, leaseSeconds = 120 }) {
  if (!client?.rpc || !client?.from) throw new TypeError("Supabase service-role client is required");
  if (typeof execute !== "function") throw new TypeError("Retry executor is required");
  if (!workerId) throw new TypeError("Stable worker identifier is required");

  async function claim(limit = 10) {
    const result = await client.rpc("claim_sync_retry_jobs", {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(100, Number(limit || 10))),
      p_lease_seconds: leaseSeconds,
    });
    return assertResult(result, "claim retry jobs") || [];
  }

  async function succeed(job) {
    assertResult(await client.from("sync_retry_jobs")
      .update({ status: "succeeded", completed_at: now().toISOString(), lease_owner: null, lease_expires_at: null })
      .eq("id", job.id)
      .eq("lease_owner", workerId), "complete retry job");
  }

  async function fail(job, error) {
    const attempts = Number(job.attempts || 0) + 1;
    const message = String(error?.message || error).slice(0, 2000);
    if (attempts >= maxAttempts) {
      assertResult(await client.from("sync_dead_letters").insert({
        user_id: job.user_id,
        account_id: job.account_id,
        resource: job.resource,
        reason: job.reason,
        attempts,
        last_error: message,
        source_retry_job_id: job.id,
      }), "insert dead letter");
      assertResult(await client.from("sync_retry_jobs")
        .update({ status: "dead_lettered", attempts, last_error: message, completed_at: now().toISOString(), lease_owner: null, lease_expires_at: null })
        .eq("id", job.id)
        .eq("lease_owner", workerId), "dead-letter retry job");
      return "dead_lettered";
    }

    const availableAt = new Date(now().getTime() + computeBackoffMs(attempts)).toISOString();
    assertResult(await client.from("sync_retry_jobs")
      .update({ status: "pending", attempts, last_error: message, available_at: availableAt, lease_owner: null, lease_expires_at: null })
      .eq("id", job.id)
      .eq("lease_owner", workerId), "reschedule retry job");
    return "rescheduled";
  }

  return {
    async runOnce({ limit = 10 } = {}) {
      const jobs = await claim(limit);
      const summary = { claimed: jobs.length, succeeded: 0, rescheduled: 0, deadLettered: 0 };
      for (const job of jobs) {
        try {
          await execute(job);
          await succeed(job);
          summary.succeeded += 1;
        } catch (error) {
          const outcome = await fail(job, error);
          if (outcome === "dead_lettered") summary.deadLettered += 1;
          else summary.rescheduled += 1;
        }
      }
      return summary;
    },
  };
}
