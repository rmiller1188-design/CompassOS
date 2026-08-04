import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { buildReadOnlyScopes, createOAuthState, createPkcePair, verifyOAuthState } from "../src/security/oauth.js";
import { decryptTokenPayload, encryptTokenPayload, redactTokenPayload } from "../src/security/token-envelope.js";
import { collectPages, withRetry } from "../src/sync/pagination.js";
import { createOutboundAction, transitionOutboundAction } from "../src/actions/approval.js";
import { createNormalizedEvent, createNormalizedMessage } from "../src/domain/normalized.js";

test("PKCE produces an S256 pair", () => {
  const pair = createPkcePair();
  assert.equal(pair.method, "S256");
  assert.ok(pair.verifier.length >= 43);
  assert.notEqual(pair.verifier, pair.challenge);
});

test("OAuth state rejects tampering and expiry", () => {
  const now = Date.now();
  const state = createOAuthState({ userId: "u1", provider: "google", now });
  assert.equal(verifyOAuthState({ nonce: state.nonce, storedNonceHash: state.nonceHash, expiresAt: state.expiresAt, now: now + 1 }), true);
  assert.equal(verifyOAuthState({ nonce: "tampered", storedNonceHash: state.nonceHash, expiresAt: state.expiresAt, now: now + 1 }), false);
  assert.equal(verifyOAuthState({ nonce: state.nonce, storedNonceHash: state.nonceHash, expiresAt: state.expiresAt, now: now + 601000 }), false);
});

test("provider scopes are read-only", () => {
  const scopes = buildReadOnlyScopes("microsoft", { mail: true, calendar: true });
  assert.ok(scopes.includes("Mail.Read"));
  assert.ok(scopes.includes("Calendars.Read"));
  assert.ok(!scopes.includes("Mail.Send"));
});

test("token envelopes round-trip and reject tampering", () => {
  const key = randomBytes(32);
  const payload = { access_token: "access", refresh_token: "refresh" };
  const envelope = encryptTokenPayload(payload, key, { accountId: "acct-1" });
  assert.deepEqual(decryptTokenPayload(envelope, key), payload);
  envelope.ciphertext = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptTokenPayload(envelope, key));
});

test("token redaction returns no secret values", () => {
  const redacted = redactTokenPayload({ access_token: "a", refresh_token: "r" });
  assert.equal(redacted.access_token, "[REDACTED]");
  assert.equal(redacted.refresh_token, "[REDACTED]");
});

test("pagination collects all pages", async () => {
  const pages = new Map([[null, { items: [1, 2], nextCursor: "a" }], ["a", { items: [3], nextCursor: null }]]);
  const result = await collectPages(async (cursor) => pages.get(cursor));
  assert.deepEqual(result.items, [1, 2, 3]);
});

test("retry backs off for 429 failures", async () => {
  let calls = 0;
  const sleeps = [];
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("busy"), { status: 429 });
    return "ok";
  }, { sleep: async (ms) => sleeps.push(ms), jitter: () => 0, baseDelayMs: 100 });
  assert.equal(result, "ok");
  assert.deepEqual(sleeps, [50, 100]);
});

test("outbound execution is impossible before owner approval", () => {
  let action = createOutboundAction({ id: "a1", userId: "u1", providerAccountId: "p1", actionType: "email.send", payloadHash: "hash" });
  assert.throws(() => transitionOutboundAction(action, "executing", { userId: "u1" }));
  action = transitionOutboundAction(action, "pending_approval", { userId: "system" });
  assert.throws(() => transitionOutboundAction(action, "approved", { userId: "u2" }));
  action = transitionOutboundAction(action, "approved", { userId: "u1" });
  assert.equal(action.approvedBy, "u1");
});

test("normalizes messages and rejects invalid event intervals", () => {
  const message = createNormalizedMessage({ provider: "google", accountId: "a", providerMessageId: "m", threadKey: "t", from: " Person@Example.com ", to: ["ME@example.com"], sentAt: "2026-08-03T12:00:00Z" });
  assert.equal(message.from, "person@example.com");
  assert.throws(() => createNormalizedEvent({ provider: "microsoft", accountId: "a", providerEventId: "e", startsAt: "2026-08-03T13:00:00Z", endsAt: "2026-08-03T12:00:00Z" }));
});
