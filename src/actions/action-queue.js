const EXECUTABLE_STATUS = "approved";
const LEASED_STATUS = "executing";

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function asDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} must be a valid date`);
  return date;
}

export function buildExecutionLease({ action, workerId, leaseDurationMs = 60_000, now = new Date() }) {
  if (!action?.id || !action?.userId || !action?.providerAccountId) throw new TypeError("Bound outbound action is required");
  if (action.status !== EXECUTABLE_STATUS) throw new Error("Only approved actions may be leased");
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 5_000) throw new RangeError("Lease duration must be at least 5000ms");
  const startedAt = asDate(now, "now");
  const normalizedWorkerId = requireNonEmpty(workerId, "Worker id");
  return {
    actionId: action.id,
    userId: action.userId,
    accountId: action.providerAccountId,
    workerId: normalizedWorkerId,
    payloadHash: action.payloadHash,
    payloadRevision: action.payloadRevision,
    expectedRevision: action.revision,
    leasedAt: startedAt.toISOString(),
    leaseExpiresAt: new Date(startedAt.getTime() + leaseDurationMs).toISOString(),
  };
}

export function assertLeaseMatchesAction(lease, action, now = new Date()) {
  if (!lease || !action) throw new TypeError("Lease and action are required");
  const checks = {
    actionId: action.id,
    userId: action.userId,
    accountId: action.providerAccountId,
    payloadHash: action.payloadHash,
    payloadRevision: action.payloadRevision,
  };
  for (const [field, expected] of Object.entries(checks)) {
    if (lease[field] !== expected) throw new Error(`Execution lease mismatch: ${field}`);
  }
  if (asDate(lease.leaseExpiresAt, "lease expiry") <= asDate(now, "now")) throw new Error("Execution lease expired");
  return true;
}

export function createSupabaseActionQueue({ client, workerId, now = () => new Date(), leaseDurationMs = 60_000 }) {
  if (!client?.rpc || !client?.from) throw new TypeError("Supabase service client is required");
  const boundWorkerId = requireNonEmpty(workerId, "Worker id");

  function assertResult(result, operation) {
    if (result?.error) {
      const error = new Error(`${operation}: ${result.error.message || "Supabase operation failed"}`);
      error.code = result.error.code;
      throw error;
    }
    return result?.data;
  }

  function mapClaim(row) {
    if (!row) return null;
    return {
      action: {
        id: row.id,
        userId: row.user_id,
        providerAccountId: row.account_id,
        actionType: row.action_type,
        payloadHash: row.payload_hash,
        payloadRevision: row.payload_revision,
        status: row.status,
        revision: row.revision,
      },
      lease: {
        actionId: row.id,
        userId: row.user_id,
        accountId: row.account_id,
        workerId: row.lease_owner,
        payloadHash: row.payload_hash,
        payloadRevision: row.payload_revision,
        expectedRevision: row.revision,
        leasedAt: row.lease_started_at,
        leaseExpiresAt: row.lease_expires_at,
      },
    };
  }

  return {
    async claimNext({ actionTypes = null } = {}) {
      const claimed = assertResult(await client.rpc("claim_next_outbound_action", {
        p_worker_id: boundWorkerId,
        p_lease_seconds: Math.ceil(leaseDurationMs / 1000),
        p_action_types: actionTypes,
      }), "claim outbound action");
      const row = Array.isArray(claimed) ? claimed[0] : claimed;
      return mapClaim(row);
    },

    async heartbeat(lease) {
      requireNonEmpty(lease?.actionId, "Action id");
      if (lease.workerId !== boundWorkerId) throw new Error("Execution lease belongs to another worker");
      const expiresAt = new Date(now().getTime() + leaseDurationMs).toISOString();
      const result = await client.from("outbound_actions").update({ lease_expires_at: expiresAt, updated_at: now().toISOString() })
        .eq("id", lease.actionId).eq("status", LEASED_STATUS).eq("lease_owner", boundWorkerId)
        .eq("payload_hash", lease.payloadHash).eq("payload_revision", lease.payloadRevision)
        .gt("lease_expires_at", now().toISOString()).select("*").maybeSingle();
      const row = assertResult(result, "heartbeat outbound action lease");
      if (!row) throw new Error("Execution lease lost or expired");
      return { ...lease, leaseExpiresAt: row.lease_expires_at || expiresAt };
    },

    async recoverExpired({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Recovery limit must be between 1 and 1000");
      const recovered = assertResult(await client.rpc("recover_expired_outbound_action_leases", { p_limit: limit }), "recover expired outbound leases");
      return Array.isArray(recovered) ? recovered : [];
    },
  };
}

export async function executeClaimedAction({ claim, loadPayload, execute, transition, now = () => new Date() }) {
  if (!claim?.action || !claim?.lease) throw new TypeError("Claimed action and lease are required");
  if (typeof loadPayload !== "function" || typeof execute !== "function" || typeof transition !== "function") {
    throw new TypeError("Payload loader, executor, and transition function are required");
  }
  assertLeaseMatchesAction(claim.lease, claim.action, now());
  const payload = await loadPayload(claim.action);
  let receipt;
  try {
    receipt = await execute({ action: claim.action, payload, lease: claim.lease });
  } catch (error) {
    await transition(claim.action.id, "failed", {
      expectedRevision: claim.action.revision,
      metadata: { workerId: claim.lease.workerId, errorCode: error.code || null, retryable: error.retryable === true },
    });
    throw error;
  }
  await transition(claim.action.id, "succeeded", {
    expectedRevision: claim.action.revision,
    metadata: { workerId: claim.lease.workerId, providerReceiptId: receipt?.providerMessageId || receipt?.providerEventId || receipt?.id || null },
  });
  return receipt;
}
