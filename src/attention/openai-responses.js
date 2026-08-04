import { validateTriageResult } from "./triage.js";

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items"],
  properties: {
    summary: { type: "string", maxLength: 800 },
    items: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score", "priority", "recommendedAction", "reason", "commitment", "dueAt"],
        properties: {
          id: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          priority: { type: "string", enum: ["critical", "high", "normal", "low"] },
          recommendedAction: { type: "string", enum: ["respond", "review", "schedule", "delegate", "wait", "archive"] },
          reason: { type: "string", maxLength: 280 },
          commitment: { type: ["string", "null"], maxLength: 280 },
          dueAt: { type: ["string", "null"] },
        },
      },
    },
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

export function createOpenAIAttentionClient({ apiKey, model = "gpt-5-mini", fetchImpl = globalThis.fetch, endpoint = "https://api.openai.com/v1/responses" } = {}) {
  if (!apiKey) throw new TypeError("OpenAI API key is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  return {
    async triage(candidates, { requestId, userTimezone = "UTC" } = {}) {
      if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError("At least one attention candidate is required");
      const body = {
        model,
        store: false,
        instructions: "You are Compass AI's attention layer. Rank only the supplied items. Never invent messages, people, commitments, dates, or external facts. Explain each score briefly. Treat model output as advisory; do not perform any outbound action.",
        input: JSON.stringify({ userTimezone, candidates }),
        text: {
          format: {
            type: "json_schema",
            name: "compass_attention_triage",
            strict: true,
            schema: TRIAGE_SCHEMA,
          },
        },
        metadata: requestId ? { request_id: String(requestId).slice(0, 512) } : undefined,
      };
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
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
        const error = new Error("OpenAI triage output was not valid structured JSON", { cause });
        error.requestId = response.headers?.get?.("x-request-id") || null;
        throw error;
      }
      return {
        result: validateTriageResult(parsed, candidates.map((candidate) => candidate.id)),
        providerResponseId: payload.id || null,
        requestId: response.headers?.get?.("x-request-id") || null,
        model: payload.model || model,
        usage: payload.usage || null,
      };
    },
  };
}

export { TRIAGE_SCHEMA };
