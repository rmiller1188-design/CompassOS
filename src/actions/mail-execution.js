import { assertApprovedPayloadUnchanged } from "./reply-draft.js";

const SEND_SCOPES = {
  google: new Set(["https://www.googleapis.com/auth/gmail.send"]),
  microsoft: new Set(["Mail.Send"]),
};

function providerError(response, payload) {
  const error = new Error(payload?.error?.message || payload?.error_description || `Provider request failed with ${response.status}`);
  error.status = response.status;
  error.code = payload?.error?.code || payload?.error || null;
  error.retryAfterMs = Number(response.headers?.get?.("retry-after") || 0) * 1000 || null;
  return error;
}

export function assertMailSendConsent(account) {
  if (!account?.provider || !SEND_SCOPES[account.provider]) throw new TypeError("Supported connected account is required");
  const granted = new Set(account.grantedScopes || []);
  for (const scope of SEND_SCOPES[account.provider]) {
    if (!granted.has(scope)) throw new Error(`Separate ${account.provider} mail-send consent is required`);
  }
  if (account.status !== "active") throw new Error("Connected account is not active");
  return true;
}

export function createGmailReplyAdapter({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Gmail fetch and token resolver are required");
  return {
    provider: "google",
    async execute({ account, payload, idempotencyKey }) {
      const token = await tokenResolver(account);
      const mime = [
        `To: ${payload.to.join(", ")}`,
        payload.cc.length ? `Cc: ${payload.cc.join(", ")}` : null,
        payload.bcc.length ? `Bcc: ${payload.bcc.join(", ")}` : null,
        `Subject: ${payload.subject}`,
        `In-Reply-To: ${payload.inReplyToMessageId}`,
        `References: ${payload.inReplyToMessageId}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        payload.bodyText,
      ].filter((line) => line != null).join("\r\n");
      const raw = Buffer.from(mime).toString("base64url");
      const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-compass-idempotency-key": idempotencyKey },
        body: JSON.stringify({ raw, threadId: payload.threadKey }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw providerError(response, result);
      return { provider: "google", providerMessageId: result.id || null, providerThreadId: result.threadId || payload.threadKey, providerRequestId: response.headers?.get?.("x-request-id") || null };
    },
  };
}

export function createMicrosoftReplyAdapter({ fetchImpl = globalThis.fetch, tokenResolver } = {}) {
  if (typeof fetchImpl !== "function" || typeof tokenResolver !== "function") throw new TypeError("Microsoft fetch and token resolver are required");
  return {
    provider: "microsoft",
    async execute({ account, payload, idempotencyKey }) {
      const token = await tokenResolver(account);
      const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(payload.inReplyToMessageId)}/reply`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "client-request-id": idempotencyKey, "return-client-request-id": "true" },
        body: JSON.stringify({ message: { subject: payload.subject, body: { contentType: "Text", content: payload.bodyText }, toRecipients: payload.to.map((address) => ({ emailAddress: { address } })), ccRecipients: payload.cc.map((address) => ({ emailAddress: { address } })), bccRecipients: payload.bcc.map((address) => ({ emailAddress: { address } })) } }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw providerError(response, result);
      }
      return { provider: "microsoft", providerMessageId: null, providerThreadId: payload.threadKey, providerRequestId: response.headers?.get?.("request-id") || null };
    },
  };
}

export function createMailExecutionService({ actionStore, adapters, now = () => new Date() } = {}) {
  if (!actionStore || !adapters) throw new TypeError("Action store and provider adapters are required");
  return {
    async execute({ userId, actionId }) {
      const action = await actionStore.claimApprovedAction({ userId, actionId, now: now().toISOString() });
      if (!action) throw new Error("Approved action was not available for execution");
      try {
        if (action.userId !== userId) throw new Error("Outbound action ownership mismatch");
        if (action.status !== "executing" || action.actionType !== "mail.reply") throw new Error("Outbound action is not executable");
        assertMailSendConsent(action.account);
        assertApprovedPayloadUnchanged({ approvedPayloadHash: action.approvedPayloadHash, payload: action.payload });
        const adapter = adapters[action.account.provider];
        if (!adapter || adapter.provider !== action.account.provider) throw new Error("Provider execution adapter is unavailable");
        const existing = await actionStore.getReceiptByIdempotencyKey(action.idempotencyKey);
        if (existing) return existing;
        const providerReceipt = await adapter.execute({ account: action.account, payload: action.payload, idempotencyKey: action.idempotencyKey });
        return await actionStore.completeAction({ userId, actionId, providerReceipt, completedAt: now().toISOString() });
      } catch (error) {
        await actionStore.failAction({ userId, actionId, error: { message: String(error.message || error), code: error.code || null, status: error.status || null, retryAfterMs: error.retryAfterMs || null }, failedAt: now().toISOString() });
        throw error;
      }
    },
  };
}

export { SEND_SCOPES };
