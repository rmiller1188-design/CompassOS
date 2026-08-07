import test from "node:test";
import assert from "node:assert/strict";
import { createReplyApprovalPayload } from "../src/actions/reply-draft.js";
import { buildProviderCorrelation, MICROSOFT_COMPASS_PROPERTY_ID } from "../src/actions/provider-reconciliation.js";
import { assertMailSendConsent, createGmailReplyAdapter, createMicrosoftReplyAdapter, createMailExecutionService } from "../src/actions/mail-execution.js";

function account(provider, scopes) { return { id: "acct-1", provider, status: "active", grantedScopes: scopes }; }
function payload() { return createReplyApprovalPayload({ accountId: "acct-1", threadKey: "thread-1", inReplyToMessageId: "msg-1", to: ["a@example.com"], subject: "Re: Hello", bodyText: "Approved reply", sourceMessageIds: ["msg-1"] }); }
function okJson(json = {}, headers = {}) { return { ok: true, status: 200, json: async () => json, headers: { get: (key) => headers[key.toLowerCase()] || null } }; }

test("send consent is separate from read consent", () => {
  assert.throws(() => assertMailSendConsent(account("google", ["https://www.googleapis.com/auth/gmail.readonly"])), /separate google mail-send consent/i);
  assert.equal(assertMailSendConsent(account("google", ["https://www.googleapis.com/auth/gmail.send"])), true);
  assert.equal(assertMailSendConsent(account("microsoft", ["Mail.Send"])), true);
});

test("gmail adapter sends MIME reply with deterministic reconciliation marker without exposing token", async () => {
  let request;
  const adapter = createGmailReplyAdapter({ tokenResolver: async () => "secret-token", fetchImpl: async (url, options) => { request = { url, options }; return okJson({ id: "sent-1", threadId: "thread-1" }, { "x-request-id": "req-1" }); } });
  const result = await adapter.execute({ account: account("google", ["https://www.googleapis.com/auth/gmail.send"]), payload: payload().payload, idempotencyKey: "idem-1" });
  assert.equal(result.providerMessageId, "sent-1");
  assert.match(request.options.headers.authorization, /^Bearer /);
  assert.doesNotMatch(request.options.body, /secret-token/);
  const decoded = Buffer.from(JSON.parse(request.options.body).raw, "base64url").toString();
  assert.match(decoded, /Approved reply/);
  assert.match(decoded, /In-Reply-To: msg-1/);
  assert.match(decoded, new RegExp(`Message-ID: ${buildProviderCorrelation("idem-1").gmailMessageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(result.correlationHash, buildProviderCorrelation("idem-1").digest);
});

test("microsoft adapter creates an immutable draft, stamps the correlation property, then sends", async () => {
  const requests = [];
  const adapter = createMicrosoftReplyAdapter({
    tokenResolver: async () => "secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/createReply")) return okJson({ id: "immutable-draft-1", conversationId: "conversation-1" }, { "request-id": "create-req" });
      if (options.method === "PATCH") return okJson({});
      if (url.endsWith("/send")) return okJson({}, { "request-id": "send-req" });
      throw new Error(`unexpected request ${url}`);
    },
  });
  const result = await adapter.execute({ account: account("microsoft", ["Mail.Send"]), payload: payload().payload, idempotencyKey: "idem-2" });
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /messages\/msg-1\/createReply$/);
  assert.match(requests[1].url, /messages\/immutable-draft-1$/);
  assert.match(requests[2].url, /messages\/immutable-draft-1\/send$/);
  assert.equal(requests[0].options.headers["client-request-id"], "idem-2");
  assert.equal(requests[0].options.headers.Prefer, 'IdType="ImmutableId"');
  const patch = JSON.parse(requests[1].options.body);
  assert.deepEqual(patch.singleValueExtendedProperties, [{ id: MICROSOFT_COMPASS_PROPERTY_ID, value: buildProviderCorrelation("idem-2").digest }]);
  assert.equal(result.providerMessageId, "immutable-draft-1");
  assert.equal(result.providerRequestId, "send-req");
  assert.equal(result.correlationHash, buildProviderCorrelation("idem-2").digest);
});

test("execution verifies ownership, approval hash, consent, and records receipt", async () => {
  const approved = payload();
  const calls = [];
  const store = {
    async claimApprovedAction() { return { id: "act-1", userId: "user-1", status: "executing", actionType: "mail.reply", payload: approved.payload, approvedPayloadHash: approved.payloadHash, idempotencyKey: "idem-3", account: account("google", ["https://www.googleapis.com/auth/gmail.send"]) }; },
    async getReceiptByIdempotencyKey() { return null; },
    async completeAction(input) { calls.push(["complete", input]); return { status: "succeeded", ...input.providerReceipt }; },
    async failAction(input) { calls.push(["fail", input]); },
  };
  const service = createMailExecutionService({ actionStore: store, adapters: { google: { provider: "google", async execute() { return { provider: "google", providerMessageId: "sent-2" }; } } }, now: () => new Date("2026-08-05T12:00:00Z") });
  const result = await service.execute({ userId: "user-1", actionId: "act-1" });
  assert.equal(result.status, "succeeded");
  assert.equal(calls[0][0], "complete");
});

test("payload mutation after approval fails closed and is audited", async () => {
  const approved = payload();
  const mutated = { ...approved.payload, bodyText: "Changed after approval" };
  let failed;
  const store = {
    async claimApprovedAction() { return { id: "act-1", userId: "user-1", status: "executing", actionType: "mail.reply", payload: mutated, approvedPayloadHash: approved.payloadHash, idempotencyKey: "idem-4", account: account("google", ["https://www.googleapis.com/auth/gmail.send"]) }; },
    async getReceiptByIdempotencyKey() { return null; },
    async completeAction() { throw new Error("must not complete"); },
    async failAction(input) { failed = input; },
  };
  const service = createMailExecutionService({ actionStore: store, adapters: { google: { provider: "google", async execute() { throw new Error("must not send"); } } } });
  await assert.rejects(() => service.execute({ userId: "user-1", actionId: "act-1" }), /changed after approval/i);
  assert.match(failed.error.message, /new approval/i);
});

test("idempotent receipt prevents duplicate provider execution", async () => {
  const approved = payload();
  let executed = 0;
  const receipt = { status: "succeeded", providerMessageId: "existing" };
  const store = {
    async claimApprovedAction() { return { id: "act-1", userId: "user-1", status: "executing", actionType: "mail.reply", payload: approved.payload, approvedPayloadHash: approved.payloadHash, idempotencyKey: "idem-5", account: account("google", ["https://www.googleapis.com/auth/gmail.send"]) }; },
    async getReceiptByIdempotencyKey() { return receipt; }, async completeAction() {}, async failAction() {},
  };
  const service = createMailExecutionService({ actionStore: store, adapters: { google: { provider: "google", async execute() { executed += 1; } } } });
  assert.equal(await service.execute({ userId: "user-1", actionId: "act-1" }), receipt);
  assert.equal(executed, 0);
});
