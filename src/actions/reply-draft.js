import { createHash } from "node:crypto";

const REPLY_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "bodyText", "tone", "sourceMessageIds", "warnings"],
  properties: {
    subject: { type: "string", maxLength: 300 },
    bodyText: { type: "string", maxLength: 12000 },
    tone: { type: "string", enum: ["concise", "professional", "friendly", "direct"] },
    sourceMessageIds: { type: "array", maxItems: 100, items: { type: "string" } },
    warnings: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
  },
};

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text");
}

function normalizeRecipients(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function hashReplyPayload(payload) {
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

export function validateReplyDraft(result, boundary) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new TypeError("Reply draft result must be an object");
  const allowedMessageIds = new Set((boundary.messages || []).map((message) => String(message.providerMessageId)));
  const sourceMessageIds = [...new Set((result.sourceMessageIds || []).map(String))];
  if (!sourceMessageIds.length) throw new TypeError("Reply draft must cite at least one source message");
  for (const messageId of sourceMessageIds) {
    if (!allowedMessageIds.has(messageId)) throw new TypeError(`Reply draft cited unknown message ${messageId}`);
  }
  const bodyText = String(result.bodyText || "").trim();
  if (!bodyText) throw new TypeError("Reply draft body is required");
  return {
    subject: String(result.subject || "").trim(),
    bodyText,
    tone: ["concise", "professional", "friendly", "direct"].includes(result.tone) ? result.tone : "professional",
    sourceMessageIds,
    warnings: [...new Set((result.warnings || []).map(String).filter(Boolean))],
  };
}

export function createOpenAIReplyDraftClient({ apiKey, model = "gpt-5-mini", fetchImpl = globalThis.fetch, endpoint = "https://api.openai.com/v1/responses" } = {}) {
  if (!apiKey) throw new TypeError("OpenAI API key is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  return {
    async draft(boundary, { requestId, tone = "professional", userInstructions = "" } = {}) {
      if (!boundary?.threadKey || !Array.isArray(boundary.messages) || !boundary.messages.length) throw new TypeError("Reply context boundary is required");
      const body = {
        model,
        store: false,
        instructions: "Draft a reply using only the supplied normalized thread context. Do not invent facts, commitments, recipients, attachments, dates, or prior conversations. The result is a draft only and must never be sent automatically. Surface uncertainty in warnings.",
        input: JSON.stringify({ requestedTone: tone, userInstructions, thread: boundary }),
        text: { format: { type: "json_schema", name: "compass_reply_draft", strict: true, schema: REPLY_DRAFT_SCHEMA } },
        metadata: requestId ? { request_id: String(requestId).slice(0, 512) } : undefined,
      };
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || `OpenAI request failed with ${response.status}`);
        error.status = response.status;
        error.code = payload?.error?.code || null;
        error.requestId = response.headers?.get?.("x-request-id") || null;
        throw error;
      }
      let parsed;
      try {
        parsed = JSON.parse(extractOutputText(payload));
      } catch (cause) {
        throw new Error("OpenAI reply draft output was not valid structured JSON", { cause });
      }
      return {
        result: validateReplyDraft(parsed, boundary),
        providerResponseId: payload.id || null,
        requestId: response.headers?.get?.("x-request-id") || null,
        model: payload.model || model,
        usage: payload.usage || null,
      };
    },
  };
}

export function createReplyApprovalPayload({ accountId, threadKey, inReplyToMessageId, to, cc = [], bcc = [], subject, bodyText, sourceMessageIds, attachments = [] }) {
  if (!accountId || !threadKey || !inReplyToMessageId) throw new TypeError("Reply account, thread, and source message are required");
  const payload = {
    version: 1,
    actionType: "mail.reply",
    accountId,
    threadKey,
    inReplyToMessageId,
    to: normalizeRecipients(to),
    cc: normalizeRecipients(cc),
    bcc: normalizeRecipients(bcc),
    subject: String(subject || "").trim(),
    bodyText: String(bodyText || "").trim(),
    sourceMessageIds: [...new Set((sourceMessageIds || []).map(String))],
    attachments: attachments.map(({ id, name, size, contentType }) => ({ id, name, size, contentType })),
  };
  if (!payload.to.length || !payload.bodyText || !payload.sourceMessageIds.length) throw new TypeError("Reply recipients, body, and provenance are required");
  return { payload, payloadHash: hashReplyPayload(payload) };
}

export function diffReplyPayload(previous, next) {
  const fields = ["to", "cc", "bcc", "subject", "bodyText", "sourceMessageIds", "attachments"];
  const changes = [];
  for (const field of fields) {
    const before = JSON.stringify(stable(previous?.[field] ?? null));
    const after = JSON.stringify(stable(next?.[field] ?? null));
    if (before !== after) changes.push({ field, before: previous?.[field] ?? null, after: next?.[field] ?? null });
  }
  return changes;
}

export function assertApprovedPayloadUnchanged({ approvedPayloadHash, payload }) {
  const current = hashReplyPayload(payload);
  if (!approvedPayloadHash || current !== approvedPayloadHash) throw new Error("Reply payload changed after approval; a new approval is required");
  return true;
}

export { REPLY_DRAFT_SCHEMA };
