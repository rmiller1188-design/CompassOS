import { createHash } from "node:crypto";
import { encryptTokenPayload, decryptTokenPayload } from "../security/token-envelope.js";
import { transitionOutboundAction } from "./approval.js";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function hashActionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Outbound payload must be an object");
  }
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

export function sealActionPayload({ payload, key, actionId, userId, accountId, actionType, revision = 1 }) {
  const payloadHash = hashActionPayload(payload);
  const context = { purpose: "outbound_action", actionId, userId, accountId, actionType, revision, payloadHash };
  return { payloadHash, envelope: encryptTokenPayload(payload, key, context) };
}

export function openActionPayload({ envelope, key, action }) {
  const context = envelope?.context || {};
  const expected = {
    purpose: "outbound_action",
    actionId: action.id,
    userId: action.userId,
    accountId: action.providerAccountId,
    actionType: action.actionType,
    revision: action.revision,
    payloadHash: action.payloadHash,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (context[field] !== value) throw new Error(`Outbound payload envelope context mismatch: ${field}`);
  }
  const payload = decryptTokenPayload(envelope, key);
  if (hashActionPayload(payload) !== action.payloadHash) throw new Error("Outbound payload integrity check failed");
  return payload;
}

export function buildChainedAuditEvent({ action, actorId = null, eventType, metadata = {}, previousEventHash = null, now = new Date() }) {
  if (!action?.id || !action?.userId || !eventType) throw new TypeError("Action, owner, and event type are required");
  const body = {
    actionId: action.id,
    userId: action.userId,
    actorId,
    eventType,
    status: action.status,
    revision: action.revision,
    payloadHash: action.payloadHash,
    metadata: stable(metadata),
    occurredAt: now.toISOString(),
    previousEventHash,
  };
  return { ...body, eventHash: createHash("sha256").update(JSON.stringify(stable(body))).digest("hex") };
}

function assertResult(result, operation) {
  if (result?.error) {
    const error = new Error(`${operation}: ${result.error.message || "Supabase operation failed"}`);
    error.code = result.error.code;
    throw error;
  }
  return result?.data;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    providerAccountId: row.account_id,
    actionType: row.action_type,
    payloadHash: row.payload_hash,
    status: row.status,
    revision: row.revision,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseOutboundActionStore({ client, userId, accountId, encryptionKey, now = () => new Date() }) {
  if (!client?.from || !userId || !accountId || !encryptionKey) throw new TypeError("Client, bound owner, account, and encryption key are required");

  async function loadRow(actionId) {
    const result = await client.from("outbound_actions").select("*")
      .eq("id", actionId).eq("user_id", userId).eq("account_id", accountId).maybeSingle();
    const row = assertResult(result, "load outbound action");
    if (!row) throw new Error("Outbound action not found in bound owner/account scope");
    return row;
  }

  async function previousAuditHash(actionId) {
    const result = await client.from("audit_events").select("event_hash")
      .eq("action_id", actionId).order("occurred_at", { ascending: false }).limit(1).maybeSingle();
    return assertResult(result, "load audit chain head")?.event_hash || null;
  }

  async function appendAudit(action, actorId, eventType, metadata) {
    const event = buildChainedAuditEvent({ action, actorId, eventType, metadata, previousEventHash: await previousAuditHash(action.id), now: now() });
    assertResult(await client.from("audit_events").insert({
      user_id: event.userId,
      action_id: event.actionId,
      actor_id: event.actorId,
      event_type: event.eventType,
      metadata: { ...event.metadata, status: event.status, revision: event.revision, payloadHash: event.payloadHash },
      previous_event_hash: event.previousEventHash,
      event_hash: event.eventHash,
      occurred_at: event.occurredAt,
    }), "append audit event");
    return event;
  }

  return {
    async createDraft({ id, actionType, payload }) {
      if (!id || !actionType) throw new TypeError("Action id and type are required");
      const sealed = sealActionPayload({ payload, key: encryptionKey, actionId: id, userId, accountId, actionType, revision: 1 });
      const timestamp = now().toISOString();
      const row = {
        id, user_id: userId, account_id: accountId, action_type: actionType,
        payload_ciphertext: sealed.envelope, payload_hash: sealed.payloadHash,
        status: "draft", revision: 1, created_at: timestamp, updated_at: timestamp,
      };
      assertResult(await client.from("outbound_actions").insert(row), "create outbound action");
      const action = mapRow(row);
      await appendAudit(action, userId, "outbound_action.created", {});
      return { ...action, payload };
    },

    async load(actionId, { includePayload = false } = {}) {
      const row = await loadRow(actionId);
      const action = mapRow(row);
      if (!includePayload) return action;
      return { ...action, payload: openActionPayload({ envelope: row.payload_ciphertext, key: encryptionKey, action }) };
    },

    async replaceDraftPayload(actionId, payload, expectedRevision) {
      const row = await loadRow(actionId);
      const action = mapRow(row);
      if (!['draft', 'pending_approval', 'failed'].includes(action.status)) throw new Error("Terminal or executing actions cannot be edited");
      if (action.revision !== expectedRevision) throw new Error("Outbound action revision conflict");
      const revision = action.revision + 1;
      const sealed = sealActionPayload({ payload, key: encryptionKey, actionId, userId, accountId, actionType: action.actionType, revision });
      const result = await client.from("outbound_actions").update({
        payload_ciphertext: sealed.envelope,
        payload_hash: sealed.payloadHash,
        status: "draft",
        revision,
        approved_by: null,
        approved_at: null,
        updated_at: now().toISOString(),
      }).eq("id", actionId).eq("user_id", userId).eq("account_id", accountId).eq("revision", expectedRevision).select("*").maybeSingle();
      const updatedRow = assertResult(result, "replace outbound payload");
      if (!updatedRow) throw new Error("Outbound action revision conflict");
      const updated = mapRow(updatedRow);
      await appendAudit(updated, userId, "outbound_action.payload_replaced", { previousPayloadHash: action.payloadHash });
      return { ...updated, payload };
    },

    async transition(actionId, nextStatus, { actorId = userId, expectedRevision, metadata = {} } = {}) {
      const row = await loadRow(actionId);
      const action = mapRow(row);
      if (expectedRevision != null && action.revision !== expectedRevision) throw new Error("Outbound action revision conflict");
      const updated = transitionOutboundAction(action, nextStatus, { userId: actorId }, now());
      const result = await client.from("outbound_actions").update({
        status: updated.status,
        revision: updated.revision,
        approved_by: updated.approvedBy,
        approved_at: updated.approvedAt,
        updated_at: updated.updatedAt,
      }).eq("id", actionId).eq("user_id", userId).eq("account_id", accountId).eq("revision", action.revision).select("*").maybeSingle();
      const updatedRow = assertResult(result, "transition outbound action");
      if (!updatedRow) throw new Error("Outbound action revision conflict");
      const persisted = mapRow(updatedRow);
      await appendAudit(persisted, actorId, `outbound_action.${nextStatus}`, metadata);
      return persisted;
    },
  };
}
