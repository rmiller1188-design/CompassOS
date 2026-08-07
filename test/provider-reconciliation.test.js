import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProviderCorrelation,
  createGmailReconciliationLookup,
  createMicrosoftReconciliationLookup,
  createProviderReconciliationLookup,
  MICROSOFT_COMPASS_PROPERTY_ID,
} from "../src/actions/provider-reconciliation.js";

const account = (provider) => ({ id: "acct-1", provider, status: "active" });
const reconciliation = (hash) => ({ actionId: "act-1", idempotencyKeyHash: hash, status: "pending" });

function response({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return { ok, status, json: async () => json, headers: { get: (key) => headers[key.toLowerCase()] || null } };
}

test("provider correlation is deterministic and does not expose the raw idempotency key", () => {
  const first = buildProviderCorrelation("secret-idempotency-key");
  const second = buildProviderCorrelation("secret-idempotency-key");
  assert.deepEqual(first, second);
  assert.equal(first.digest.length, 64);
  assert.match(first.gmailMessageId, /^<compass-[a-f0-9]{64}@compass\.invalid>$/);
  assert.equal(first.microsoftPropertyId, MICROSOFT_COMPASS_PROPERTY_ID);
  assert.doesNotMatch(JSON.stringify(first), /secret-idempotency-key/);
});

test("gmail reconciliation returns success only for one exact sent-message correlation", async () => {
  const hash = buildProviderCorrelation("idem-1").digest;
  let requested;
  const lookup = createGmailReconciliationLookup({
    tokenResolver: async () => "google-token",
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return response({ json: { messages: [{ id: "gmail-1", threadId: "thread-1" }] } });
    },
  });
  const outcome = await lookup({ account: account("google"), reconciliation: reconciliation(hash) });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.receipt.providerMessageId, "gmail-1");
  assert.match(decodeURIComponent(requested.url), /rfc822msgid:<compass-/);
  assert.match(requested.options.headers.authorization, /^Bearer /);
  assert.doesNotMatch(requested.url, /google-token/);
});

test("gmail reconciliation fails closed on duplicate matches", async () => {
  const hash = buildProviderCorrelation("idem-2").digest;
  const lookup = createGmailReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ json: { messages: [{ id: "one" }, { id: "two" }] } }),
  });
  const outcome = await lookup({ account: account("google"), reconciliation: reconciliation(hash) });
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.evidence.reason, "NON_UNIQUE_CORRELATION");
});

test("microsoft reconciliation queries Sent Items by the persisted extended-property hash", async () => {
  const hash = buildProviderCorrelation("idem-3").digest;
  let requested;
  const lookup = createMicrosoftReconciliationLookup({
    tokenResolver: async () => "graph-token",
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return response({ json: { value: [{ id: "immutable-1", conversationId: "conversation-1", internetMessageId: "<msg@example.com>" }] } });
    },
  });
  const outcome = await lookup({ account: account("microsoft"), reconciliation: reconciliation(hash) });
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.receipt.providerMessageId, "immutable-1");
  assert.match(decodeURIComponent(requested.url), /singleValueExtendedProperties\/Any/);
  assert.match(decodeURIComponent(requested.url), new RegExp(hash));
  assert.equal(requested.options.headers.Prefer, 'IdType="ImmutableId"');
  assert.doesNotMatch(requested.url, /graph-token/);
});

test("provider lookup reports confirmed absence only for a successful zero-match provider query", async () => {
  const hash = buildProviderCorrelation("idem-4").digest;
  const google = createGmailReconciliationLookup({ tokenResolver: async () => "token", fetchImpl: async () => response({ json: {} }) });
  const outcome = await google({ account: account("google"), reconciliation: reconciliation(hash) });
  assert.equal(outcome.status, "not_found");
  assert.equal(outcome.evidence.matchCount, 0);
});

test("provider lookup propagates provider failures instead of misclassifying them as absence", async () => {
  const hash = buildProviderCorrelation("idem-5").digest;
  const google = createGmailReconciliationLookup({
    tokenResolver: async () => "token",
    fetchImpl: async () => response({ ok: false, status: 503, json: { error: { message: "temporary" } } }),
  });
  await assert.rejects(() => google({ account: account("google"), reconciliation: reconciliation(hash) }), /temporary/);
});

test("provider router stays fail-closed when a lookup adapter is unavailable", async () => {
  const router = createProviderReconciliationLookup({});
  const outcome = await router({ account: account("google"), reconciliation: reconciliation(buildProviderCorrelation("idem-6").digest) });
  assert.equal(outcome.status, "unknown");
  assert.equal(outcome.evidence.reason, "LOOKUP_UNAVAILABLE");
});
