import test from "node:test";
import assert from "node:assert/strict";
import { buildAttentionCandidate, selectAttentionCandidates, validateTriageResult, buildCatchMeUpBrief } from "../src/attention/triage.js";
import { createOpenAIAttentionClient } from "../src/attention/openai-responses.js";

const baseMessage = {
  accountId: "acc-1",
  provider: "google",
  providerMessageId: "msg-1",
  threadKey: "thread-1",
  subject: "Need approval by EOD",
  snippet: "Can you please confirm today?",
  from: "pm@example.com",
  to: ["owner@example.com"],
  cc: [],
  receivedAt: "2026-08-05T08:00:00.000Z",
  isRead: false,
};

test("attention candidate exposes deterministic indicators and score", () => {
  const candidate = buildAttentionCandidate(baseMessage, {
    now: new Date("2026-08-05T10:00:00.000Z"),
    userEmails: ["owner@example.com"],
  });
  assert.equal(candidate.indicators.directToUser, true);
  assert.equal(candidate.indicators.deadlineLanguage, true);
  assert.equal(candidate.indicators.questionLanguage, true);
  assert.equal(candidate.deterministicScore, 94);
});

test("candidate selection is bounded and deterministic", () => {
  const messages = [
    baseMessage,
    { ...baseMessage, providerMessageId: "msg-2", subject: "Newsletter", snippet: "Weekly update", isRead: true, receivedAt: "2026-07-30T08:00:00.000Z" },
  ];
  const selected = selectAttentionCandidates(messages, {
    now: new Date("2026-08-05T10:00:00.000Z"),
    userEmails: ["owner@example.com"],
    limit: 1,
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].providerMessageId, "msg-1");
});

test("triage validation rejects invented and duplicate ids", () => {
  assert.throws(() => validateTriageResult({ summary: "x", items: [{ id: "invented", score: 90, priority: "high", recommendedAction: "respond", reason: "x", commitment: null, dueAt: null }] }, ["acc-1:msg-1"]), /Unknown triage item/);
  const duplicate = { id: "acc-1:msg-1", score: 90, priority: "high", recommendedAction: "respond", reason: "x", commitment: null, dueAt: null };
  assert.throws(() => validateTriageResult({ summary: "x", items: [duplicate, duplicate] }, ["acc-1:msg-1"]), /Duplicate triage item/);
});

test("Catch Me Up brief groups ranked validated items", () => {
  const candidates = [buildAttentionCandidate(baseMessage, { now: new Date("2026-08-05T10:00:00.000Z") })];
  const validated = validateTriageResult({ summary: "One urgent item", items: [{ id: candidates[0].id, score: 98, priority: "critical", recommendedAction: "respond", reason: "Approval requested today", commitment: "Confirm approval", dueAt: "2026-08-05T23:59:00.000Z" }] }, [candidates[0].id]);
  const brief = buildCatchMeUpBrief(validated, candidates);
  assert.equal(brief.critical.length, 1);
  assert.equal(brief.critical[0].candidate.threadKey, "thread-1");
});

test("OpenAI adapter sends store false structured output request and validates response", async () => {
  let captured;
  const fetchImpl = async (_url, init) => {
    captured = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name === "x-request-id" ? "req_test" : null },
      json: async () => ({
        id: "resp_test",
        model: "gpt-5-mini",
        output_text: JSON.stringify({
          summary: "Respond to the approval request.",
          items: [{ id: "acc-1:msg-1", score: 96, priority: "critical", recommendedAction: "respond", reason: "Direct deadline request", commitment: "Confirm approval", dueAt: "2026-08-05T23:59:00.000Z" }],
        }),
      }),
    };
  };
  const client = createOpenAIAttentionClient({ apiKey: "test-key", fetchImpl });
  const candidate = buildAttentionCandidate(baseMessage, { now: new Date("2026-08-05T10:00:00.000Z") });
  const output = await client.triage([candidate], { requestId: "triage-1", userTimezone: "America/Los_Angeles" });
  assert.equal(captured.store, false);
  assert.equal(captured.text.format.type, "json_schema");
  assert.equal(captured.text.format.strict, true);
  assert.equal(output.result.items[0].id, candidate.id);
  assert.equal(output.requestId, "req_test");
});

test("OpenAI adapter propagates sanitized provider error metadata", async () => {
  const client = createOpenAIAttentionClient({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => "req_rate" },
      json: async () => ({ error: { message: "Rate limited", code: "rate_limit_exceeded" } }),
    }),
  });
  const candidate = buildAttentionCandidate(baseMessage, { now: new Date("2026-08-05T10:00:00.000Z") });
  await assert.rejects(() => client.triage([candidate]), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "rate_limit_exceeded");
    assert.equal(error.requestId, "req_rate");
    return true;
  });
});
