const MEETING_PREP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "people", "discussionPoints", "openQuestions", "commitments", "risks"],
  properties: {
    overview: { type: "string", maxLength: 1200 },
    people: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["email", "context"],
        properties: {
          email: { type: "string" },
          context: { type: "string", maxLength: 600 },
        },
      },
    },
    discussionPoints: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
    openQuestions: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
    commitments: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "ownerEmail", "dueAt", "sourceThreadKey"],
        properties: {
          text: { type: "string", maxLength: 500 },
          ownerEmail: { type: ["string", "null"] },
          dueAt: { type: ["string", "null"] },
          sourceThreadKey: { type: ["string", "null"] },
        },
      },
    },
    risks: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validateMeetingPrep(result, boundary) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new TypeError("Meeting preparation result must be an object");
  const allowedEmails = new Set((boundary.people || []).map((person) => String(person.email || "").toLowerCase()));
  const allowedThreads = new Set(boundary.provenance?.threadKeys || []);
  const people = Array.isArray(result.people) ? result.people : [];
  const seen = new Set();
  for (const person of people) {
    const email = String(person.email || "").toLowerCase();
    if (!allowedEmails.has(email)) throw new TypeError(`Meeting preparation invented attendee ${email}`);
    if (seen.has(email)) throw new TypeError(`Duplicate attendee ${email}`);
    seen.add(email);
  }
  const commitments = Array.isArray(result.commitments) ? result.commitments : [];
  for (const commitment of commitments) {
    const owner = commitment.ownerEmail == null ? null : String(commitment.ownerEmail).toLowerCase();
    if (owner && !allowedEmails.has(owner)) throw new TypeError(`Commitment owner is outside meeting context: ${owner}`);
    if (commitment.sourceThreadKey && !allowedThreads.has(commitment.sourceThreadKey)) {
      throw new TypeError(`Commitment source thread is outside meeting provenance: ${commitment.sourceThreadKey}`);
    }
    if (commitment.dueAt != null && Number.isNaN(Date.parse(commitment.dueAt))) throw new TypeError("Commitment dueAt must be an ISO-compatible timestamp or null");
  }
  return {
    overview: String(result.overview || ""),
    people,
    discussionPoints: unique((result.discussionPoints || []).map(String)),
    openQuestions: unique((result.openQuestions || []).map(String)),
    commitments,
    risks: unique((result.risks || []).map(String)),
  };
}

export function createOpenAIMeetingPrepClient({ apiKey, model = "gpt-5-mini", fetchImpl = globalThis.fetch, endpoint = "https://api.openai.com/v1/responses" } = {}) {
  if (!apiKey) throw new TypeError("OpenAI API key is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  return {
    async prepare(boundary, { requestId, userTimezone = "UTC" } = {}) {
      if (!boundary?.event || !Array.isArray(boundary.people)) throw new TypeError("Meeting preparation boundary is required");
      const body = {
        model,
        store: false,
        instructions: "Prepare a concise meeting brief using only the supplied event, people, recent conversation, and provenance. Never invent people, threads, commitments, dates, or external facts. Mark uncertainty in plain language. Do not execute any external action.",
        input: JSON.stringify({ userTimezone, meeting: boundary }),
        text: { format: { type: "json_schema", name: "compass_meeting_preparation", strict: true, schema: MEETING_PREP_SCHEMA } },
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
        const error = new Error("OpenAI meeting preparation output was not valid structured JSON", { cause });
        error.requestId = response.headers?.get?.("x-request-id") || null;
        throw error;
      }
      return {
        result: validateMeetingPrep(parsed, boundary),
        providerResponseId: payload.id || null,
        requestId: response.headers?.get?.("x-request-id") || null,
        model: payload.model || model,
        usage: payload.usage || null,
      };
    },
  };
}

export { MEETING_PREP_SCHEMA, validateMeetingPrep };
