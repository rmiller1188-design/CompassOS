const GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GRAPH_DELTA = "https://graph.microsoft.com/v1.0/me/calendarView/delta";

function encode(value) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decode(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new TypeError("Invalid calendar cursor"); }
}
function providerError(response, body) {
  const error = new Error(body?.error?.message || body?.error_description || `Provider request failed (${response.status})`);
  error.status = response.status;
  error.code = body?.error?.status || body?.error?.code || body?.error || "provider_error";
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) error.retryAfterMs = Number(retryAfter) * 1000;
  return error;
}
async function requestJson(fetchFn, url, token, headers = {}) {
  const response = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json", ...headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response, body);
  return body;
}
function googleDate(value) { return value?.dateTime || (value?.date ? `${value.date}T00:00:00.000Z` : null); }
function graphDate(value) { return value?.dateTime ? new Date(`${value.dateTime}${/[zZ]|[+-]\d\d:\d\d$/.test(value.dateTime) ? "" : "Z"}`).toISOString() : null; }

export function createGoogleCalendarAdapter({ fetchFn = fetch, getAccessToken }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchCalendarPage({ account, cursor, mode }) {
      const token = await getAccessToken(account);
      const state = decode(cursor);
      const params = new URLSearchParams({ maxResults: "250", singleEvents: "true", showDeleted: "true" });
      if (state?.pageToken) params.set("pageToken", state.pageToken);
      if (mode === "incremental") {
        if (!state?.syncToken) throw new TypeError("Google calendar incremental cursor requires syncToken");
        params.set("syncToken", state.syncToken);
      } else {
        params.set("timeMin", new Date(Date.now() - 30 * 86400000).toISOString());
      }
      const body = await requestJson(fetchFn, `${GOOGLE_EVENTS}?${params}`, token);
      const nextCursor = body.nextPageToken ? encode({ syncToken: state?.syncToken || null, pageToken: body.nextPageToken }) : null;
      return { items: body.items || [], requestCursor: cursor, nextCursor, checkpoint: nextCursor ? null : encode({ syncToken: body.nextSyncToken || state?.syncToken }) };
    },
    normalizeEvent(account, item) {
      const attendees = (item.attendees || []).map((entry) => entry.email).filter(Boolean);
      return { accountId: account.id, provider: "google", providerEventId: item.id, title: item.summary || "Untitled event", startsAt: googleDate(item.start), endsAt: googleDate(item.end), timezone: item.start?.timeZone || item.end?.timeZone || "UTC", organizer: item.organizer?.email || null, attendees, location: item.location || null, isCancelled: item.status === "cancelled", rawRef: { resource: "google_calendar", calendarId: "primary", id: item.id, etag: item.etag || null } };
    },
  };
}

export function createMicrosoftCalendarAdapter({ fetchFn = fetch, getAccessToken, now = () => new Date() }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchCalendarPage({ account, cursor }) {
      const token = await getAccessToken(account);
      const state = decode(cursor);
      let url = state?.deltaUrl;
      if (!url) {
        const start = new Date(now().getTime() - 30 * 86400000).toISOString();
        const end = new Date(now().getTime() + 365 * 86400000).toISOString();
        const params = new URLSearchParams({ startDateTime: start, endDateTime: end, $select: "id,subject,start,end,organizer,attendees,location,isCancelled,seriesMasterId,lastModifiedDateTime", $top: "100" });
        url = `${GRAPH_DELTA}?${params}`;
      }
      const body = await requestJson(fetchFn, url, token, { Prefer: 'outlook.timezone="UTC"' });
      return { items: body.value || [], requestCursor: cursor, nextCursor: body["@odata.nextLink"] ? encode({ deltaUrl: body["@odata.nextLink"] }) : null, checkpoint: body["@odata.deltaLink"] ? encode({ deltaUrl: body["@odata.deltaLink"] }) : null };
    },
    normalizeEvent(account, item) {
      const address = (entry) => entry?.emailAddress?.address || null;
      return { accountId: account.id, provider: "microsoft", providerEventId: item.id, title: item.subject || "Untitled event", startsAt: graphDate(item.start), endsAt: graphDate(item.end), timezone: item.start?.timeZone || item.end?.timeZone || "UTC", organizer: address(item.organizer), attendees: (item.attendees || []).map(address).filter(Boolean), location: item.location?.displayName || null, isCancelled: Boolean(item.isCancelled || item["@removed"]), rawRef: { resource: "graph_calendar", id: item.id, seriesMasterId: item.seriesMasterId || null } };
    },
  };
}

export const calendarCursor = Object.freeze({ encode, decode });
