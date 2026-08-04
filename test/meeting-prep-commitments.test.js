import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAIMeetingPrepClient, validateMeetingPrep } from "../src/attention/meeting-prep.js";
import { createCommitment, transitionCommitment, reviseCommitment, commitmentsFromMeetingPrep } from "../src/attention/commitments.js";

const boundary = {
  event: { accountId: "a1", providerEventId: "e1", title: "Project review", startsAt: "2026-08-06T17:00:00.000Z" },
  people: [
    { email: "alex@example.com", displayName: "Alex", recentConversation: [{ subject: "Schedule", snippet: "I will send pricing Friday", receivedAt: "2026-08-05T10:00:00.000Z" }] },
  ],
  provenance: { threadKeys: ["thread-1"], generatedFrom: { attendeeCount: 1 } },
};

const modelResult = {
  overview: "Review schedule and pricing.",
  people: [{ email: "alex@example.com", context: "Alex committed to send pricing." }],
  discussionPoints: ["Confirm pricing delivery"],
  openQuestions: ["Is Friday still achievable?"],
  commitments: [{ text: "Send pricing", ownerEmail: "alex@example.com", dueAt: "2026-08-07T17:00:00Z", sourceThreadKey: "thread-1" }],
  risks: ["Pricing may affect schedule"],
};

test("meeting prep client uses structured output and store false", async () => {
  let request;
  const client = createOpenAIMeetingPrepClient({
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return { ok: true, json: async () => ({ id: "resp_1", model: "gpt-5-mini", output_text: JSON.stringify(modelResult) }), headers: { get: () => "req_1" } };
    },
  });
  const output = await client.prepare(boundary, { requestId: "meeting-1", userTimezone: "America/Los_Angeles" });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(output.result.commitments[0].sourceThreadKey, "thread-1");
});

test("meeting prep rejects invented people and provenance", () => {
  assert.throws(() => validateMeetingPrep({ ...modelResult, people: [{ email: "invented@example.com", context: "none" }] }, boundary), /invented attendee/);
  assert.throws(() => validateMeetingPrep({ ...modelResult, commitments: [{ ...modelResult.commitments[0], sourceThreadKey: "unknown" }] }, boundary), /outside meeting provenance/);
});

test("commitments require owner confirmation and valid transitions", () => {
  const now = () => new Date("2026-08-05T12:00:00.000Z");
  const commitment = createCommitment({ userId: "u1", text: "Send pricing", sourceType: "meeting_preparation", sourceId: "e1" }, { now, idFactory: () => "c1" });
  assert.equal(commitment.status, "proposed");
  assert.throws(() => transitionCommitment(commitment, "completed", { actorUserId: "u1", now }), /Invalid commitment transition/);
  assert.throws(() => transitionCommitment(commitment, "confirmed", { actorUserId: "u2", now }), /ownership mismatch/);
  const confirmed = transitionCommitment(commitment, "confirmed", { actorUserId: "u1", now, correction: "Confirmed during review" });
  const completed = transitionCommitment(confirmed, "completed", { actorUserId: "u1", now });
  assert.equal(completed.status, "completed");
  assert.equal(confirmed.correction.text, "Confirmed during review");
});

test("commitments can be revised before terminal state", () => {
  const now = () => new Date("2026-08-05T12:00:00.000Z");
  const commitment = createCommitment({ userId: "u1", text: "Send pricing", sourceType: "message", sourceId: "m1" }, { now, idFactory: () => "c1" });
  const revised = reviseCommitment(commitment, { text: "Send final pricing", dueAt: "2026-08-08T17:00:00Z" }, { actorUserId: "u1", now });
  assert.equal(revised.text, "Send final pricing");
  assert.equal(revised.dueAt, "2026-08-08T17:00:00.000Z");
});

test("meeting preparation commitments remain proposed", () => {
  let n = 0;
  const commitments = commitmentsFromMeetingPrep({ userId: "u1", meetingPrep: modelResult, providerEventId: "e1", now: () => new Date("2026-08-05T12:00:00.000Z"), idFactory: () => `c${++n}` });
  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].status, "proposed");
  assert.equal(commitments[0].sourceThreadKey, "thread-1");
});
