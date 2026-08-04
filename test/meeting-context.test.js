import test from "node:test";
import assert from "node:assert/strict";
import { buildIdentityIndex, buildMeetingContext, createMeetingPrepBoundary } from "../src/context/meeting-context.js";

const event = {
  accountId: "account-1",
  provider: "google",
  providerEventId: "event-1",
  title: "Project review",
  startsAt: "2026-08-06T17:00:00.000Z",
  endsAt: "2026-08-06T18:00:00.000Z",
  organizer: "owner@example.com",
  attendees: ["alex@example.com"],
  location: "Conference room",
};

const contacts = [
  { accountId: "account-1", provider: "google", providerContactId: "g1", displayName: "Alex Rivera", emails: ["Alex@Example.com"], organization: "Northstar", jobTitle: "PM", isDeleted: false },
  { accountId: "account-2", provider: "microsoft", providerContactId: "m1", displayName: "Alex R.", emails: ["alex@example.com"], organization: null, jobTitle: null, isDeleted: false },
  { accountId: "account-1", provider: "google", providerContactId: "deleted", displayName: "Old", emails: ["old@example.com"], isDeleted: true },
];

const messages = [
  { accountId: "account-1", providerMessageId: "m1", threadKey: "t1", subject: "Project status", snippet: "Latest update", from: "alex@example.com", to: ["owner@example.com"], cc: [], sentAt: "2026-08-05T10:00:00.000Z", receivedAt: "2026-08-05T10:00:00.000Z" },
  { accountId: "account-1", providerMessageId: "m2", threadKey: "t2", subject: "Older", snippet: "Previous note", from: "owner@example.com", to: ["alex@example.com"], cc: [], sentAt: "2026-08-01T10:00:00.000Z", receivedAt: "2026-08-01T10:00:00.000Z" },
  { accountId: "account-1", providerMessageId: "m3", threadKey: "t3", subject: "Unrelated", snippet: "No match", from: "other@example.com", to: ["owner@example.com"], cc: [], sentAt: "2026-08-05T12:00:00.000Z", receivedAt: "2026-08-05T12:00:00.000Z" },
];

test("identity index resolves equivalent provider contacts by normalized email", () => {
  const index = buildIdentityIndex(contacts);
  assert.equal(index.get("alex@example.com").length, 2);
  assert.equal(index.has("old@example.com"), false);
});

test("meeting context connects attendees to identities and recent threads", () => {
  const context = buildMeetingContext({ event, contacts, messages, maxMessagesPerAttendee: 1 });
  const alex = context.attendees.find((item) => item.email === "alex@example.com");
  assert.equal(alex.displayName, "Alex Rivera");
  assert.equal(alex.organization, "Northstar");
  assert.equal(alex.recentMessages.length, 1);
  assert.equal(alex.recentMessages[0].threadKey, "t1");
  assert.deepEqual(context.threadKeys, ["t1"]);
});

test("meeting prep boundary contains compact context and provenance", () => {
  const context = buildMeetingContext({ event, contacts, messages });
  const prep = createMeetingPrepBoundary(context);
  assert.equal(prep.event.providerEventId, "event-1");
  assert.equal(prep.people.length, 2);
  assert.ok(prep.provenance.threadKeys.includes("t1"));
  assert.equal("rawRef" in prep.event, false);
});

test("meeting context requires a normalized event", () => {
  assert.throws(() => buildMeetingContext({ event: {} }), /Normalized event/);
});
