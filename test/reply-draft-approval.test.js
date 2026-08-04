import test from "node:test";
import assert from "node:assert/strict";
import {
  assertApprovedPayloadUnchanged,
  createOpenAIReplyDraftClient,
  createReplyApprovalPayload,
  diffReplyPayload,
  hashReplyPayload,
  validateReplyDraft,
} from "../src/actions/reply-draft.js";

const boundary = {
  accountId: "acct-1",
  threadKey: "thread-1",
  participants: ["owner@example.com", "client@example.com"],
  messages: [
    { providerMessageId: "m1", from: "client@example.com", subject: "Schedule", snippet: "Can we meet Tuesday?" },
    { providerMessageId: "m2", from: "owner@example.com", subject: "Re: Schedule", snippet: "Tuesday may work." },
  ],
};

test("reply drafting uses strict structured output and store false", async () => {
  let request;
  const fetchImpl = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => "req-1" },
      json: async () => ({
        id: "resp-1",
        model: "gpt-test",
        output_text: JSON.stringify({
          subject: "Re: Schedule",
          bodyText: "Tuesday works for me. What time is best?",
          tone: "professional",
          sourceMessageIds: ["m1", "m2"],
          warnings: [],
        }),
      }),
    };
  };
  const client = createOpenAIReplyDraftClient({ apiKey: "test", fetchImpl });
  const output = await client.draft(boundary, { requestId: "draft-1" });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(output.result.bodyText, "Tuesday works for me. What time is best?");
  assert.equal(output.requestId, "req-1");
});

test("reply drafting rejects invented source messages", () => {
  assert.throws(() => validateReplyDraft({
    subject: "Re",
    bodyText: "Draft",
    tone: "professional",
    sourceMessageIds: ["unknown"],
    warnings: [],
  }, boundary), /unknown message/);
});

test("approval payload normalizes recipients and has deterministic hash", () => {
  const first = createReplyApprovalPayload({
    accountId: "acct-1",
    threadKey: "thread-1",
    inReplyToMessageId: "m1",
    to: [" Client@Example.com ", "client@example.com"],
    cc: [],
    subject: "Re: Schedule",
    bodyText: "Tuesday works.",
    sourceMessageIds: ["m1"],
  });
  const second = createReplyApprovalPayload({
    accountId: "acct-1",
    threadKey: "thread-1",
    inReplyToMessageId: "m1",
    to: ["client@example.com"],
    subject: "Re: Schedule",
    bodyText: "Tuesday works.",
    sourceMessageIds: ["m1"],
  });
  assert.deepEqual(first.payload.to, ["client@example.com"]);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(first.payloadHash, hashReplyPayload(first.payload));
});

test("payload diff exposes reviewable changes", () => {
  const base = createReplyApprovalPayload({
    accountId: "acct-1", threadKey: "thread-1", inReplyToMessageId: "m1",
    to: ["client@example.com"], subject: "Re", bodyText: "Original", sourceMessageIds: ["m1"],
  }).payload;
  const edited = { ...base, bodyText: "Edited", cc: ["manager@example.com"] };
  const diff = diffReplyPayload(base, edited);
  assert.deepEqual(diff.map((item) => item.field), ["cc", "bodyText"]);
});

test("approved payload must remain byte-equivalent in canonical form", () => {
  const { payload, payloadHash } = createReplyApprovalPayload({
    accountId: "acct-1", threadKey: "thread-1", inReplyToMessageId: "m1",
    to: ["client@example.com"], subject: "Re", bodyText: "Approved", sourceMessageIds: ["m1"],
  });
  assert.equal(assertApprovedPayloadUnchanged({ approvedPayloadHash: payloadHash, payload }), true);
  assert.throws(() => assertApprovedPayloadUnchanged({ approvedPayloadHash: payloadHash, payload: { ...payload, bodyText: "Changed" } }), /new approval is required/);
});

test("approval payload rejects incomplete send intent", () => {
  assert.throws(() => createReplyApprovalPayload({
    accountId: "acct-1", threadKey: "thread-1", inReplyToMessageId: "m1",
    to: [], subject: "Re", bodyText: "Draft", sourceMessageIds: ["m1"],
  }), /recipients, body, and provenance/);
});
