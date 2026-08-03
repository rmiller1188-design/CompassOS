const TRANSITIONS = Object.freeze({
  draft: new Set(["pending_approval", "cancelled"]),
  pending_approval: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["executing", "cancelled"]),
  executing: new Set(["succeeded", "failed"]),
  failed: new Set(["pending_approval", "cancelled"]),
  succeeded: new Set(),
  rejected: new Set(),
  cancelled: new Set(),
});

export function createOutboundAction({ id, userId, providerAccountId, actionType, payloadHash, now = new Date() }) {
  if (!id || !userId || !providerAccountId || !actionType || !payloadHash) {
    throw new TypeError("Outbound action identity, ownership, type, and payload hash are required");
  }
  return {
    id,
    userId,
    providerAccountId,
    actionType,
    payloadHash,
    status: "draft",
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
}

export function transitionOutboundAction(action, nextStatus, actor, now = new Date()) {
  const allowed = TRANSITIONS[action.status];
  if (!allowed?.has(nextStatus)) throw new Error(`Invalid outbound action transition: ${action.status} -> ${nextStatus}`);
  if (["approved", "rejected", "cancelled"].includes(nextStatus) && actor?.userId !== action.userId) {
    throw new Error("Only the owning user may approve, reject, or cancel an outbound action");
  }
  const updated = { ...action, status: nextStatus, revision: action.revision + 1, updatedAt: now.toISOString() };
  if (nextStatus === "approved") {
    updated.approvedAt = now.toISOString();
    updated.approvedBy = actor.userId;
  }
  return updated;
}

export function buildAuditEvent({ action, actor, eventType, metadata = {}, now = new Date() }) {
  return {
    actionId: action.id,
    userId: action.userId,
    actorId: actor?.userId || null,
    eventType,
    status: action.status,
    revision: action.revision,
    metadata,
    occurredAt: now.toISOString(),
  };
}
