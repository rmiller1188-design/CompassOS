const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me/messages/delta";

function providerError(response, body) {
  const error = new Error(body?.error?.message || body?.error_description || `Provider request failed (${response.status})`);
  error.status = response.status;
  error.code = body?.error?.status || body?.error?.code || body?.error || "provider_error";
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) error.retryAfterMs = Number(retryAfter) * 1000;
  return error;
}

async function requestJson(fetchFn, url, accessToken) {
  const response = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response, body);
  return body;
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new TypeError("Invalid provider cursor"); }
}

function header(headers, name) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function emails(value) {
  return String(value || "").split(",").map((item) => item.match(/<([^>]+)>/)?.[1] || item.trim()).filter(Boolean);
}

export function createGmailMailAdapter({ fetchFn = fetch, getAccessToken }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchMailPage({ account, cursor, mode }) {
      const token = await getAccessToken(account);
      const state = decodeCursor(cursor);
      if (mode === "bootstrap") {
        const params = new URLSearchParams({ maxResults: "100", includeSpamTrash: "false" });
        if (state?.pageToken) params.set("pageToken", state.pageToken);
        const list = await requestJson(fetchFn, `${GMAIL_BASE}/messages?${params}`, token);
        const items = await Promise.all((list.messages || []).map(({ id }) => requestJson(fetchFn, `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=Date`, token)));
        if (list.nextPageToken) return { items, requestCursor: cursor, nextCursor: encodeCursor({ pageToken: list.nextPageToken }) };
        const profile = await requestJson(fetchFn, `${GMAIL_BASE}/profile`, token);
        return { items, requestCursor: cursor, nextCursor: null, checkpoint: encodeCursor({ historyId: profile.historyId }) };
      }
      if (!state?.historyId) throw new TypeError("Gmail incremental cursor requires historyId");
      const params = new URLSearchParams({ startHistoryId: state.historyId, historyTypes: "messageAdded", maxResults: "100" });
      if (state.pageToken) params.set("pageToken", state.pageToken);
      const history = await requestJson(fetchFn, `${GMAIL_BASE}/history?${params}`, token);
      const ids = [...new Set((history.history || []).flatMap((entry) => entry.messagesAdded || []).map((entry) => entry.message?.id).filter(Boolean))];
      const items = await Promise.all(ids.map((id) => requestJson(fetchFn, `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=Date`, token)));
      const nextCursor = history.nextPageToken ? encodeCursor({ historyId: state.historyId, pageToken: history.nextPageToken }) : null;
      return { items, requestCursor: cursor, nextCursor, checkpoint: nextCursor ? null : encodeCursor({ historyId: history.historyId || state.historyId }) };
    },
    normalizeMessage(account, item) {
      const headers = item.payload?.headers || [];
      const from = emails(header(headers, "From"))[0] || null;
      const sentAt = Number(item.internalDate) ? new Date(Number(item.internalDate)).toISOString() : new Date(header(headers, "Date")).toISOString();
      return { accountId: account.id, provider: "google", providerMessageId: item.id, threadKey: item.threadId || item.id, internetMessageId: header(headers, "Message-ID") || null, subject: header(headers, "Subject"), snippet: item.snippet || "", from, to: emails(header(headers, "To")), cc: emails(header(headers, "Cc")), sentAt, receivedAt: sentAt, isRead: !(item.labelIds || []).includes("UNREAD"), hasAttachments: Boolean(item.payload?.parts?.some((part) => part.filename)), rawRef: { resource: "gmail", id: item.id } };
    },
  };
}

export function createMicrosoftMailAdapter({ fetchFn = fetch, getAccessToken }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchMailPage({ account, cursor }) {
      const token = await getAccessToken(account);
      const state = decodeCursor(cursor);
      const url = state?.deltaUrl || `${GRAPH_BASE}?$select=id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isRead,hasAttachments&$top=100`;
      const body = await requestJson(fetchFn, url, token);
      return { items: body.value || [], requestCursor: cursor, nextCursor: body["@odata.nextLink"] ? encodeCursor({ deltaUrl: body["@odata.nextLink"] }) : null, checkpoint: body["@odata.deltaLink"] ? encodeCursor({ deltaUrl: body["@odata.deltaLink"] }) : null };
    },
    normalizeMessage(account, item) {
      const address = (entry) => entry?.emailAddress?.address || null;
      return { accountId: account.id, provider: "microsoft", providerMessageId: item.id, threadKey: item.conversationId || item.id, internetMessageId: item.internetMessageId || null, subject: item.subject || "", snippet: item.bodyPreview || "", from: address(item.from), to: (item.toRecipients || []).map(address).filter(Boolean), cc: (item.ccRecipients || []).map(address).filter(Boolean), sentAt: item.sentDateTime || item.receivedDateTime, receivedAt: item.receivedDateTime || item.sentDateTime, isRead: item.isRead, hasAttachments: item.hasAttachments, rawRef: { resource: "graph", id: item.id } };
    },
  };
}

export const providerCursor = Object.freeze({ encode: encodeCursor, decode: decodeCursor });
