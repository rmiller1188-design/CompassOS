const GOOGLE_CONNECTIONS = "https://people.googleapis.com/v1/people/me/connections";
const GRAPH_CONTACTS_DELTA = "https://graph.microsoft.com/v1.0/me/contacts/delta";

function encode(value) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decode(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new TypeError("Invalid contacts cursor"); }
}
function providerError(response, body) {
  const error = new Error(body?.error?.message || body?.error_description || `Provider request failed (${response.status})`);
  error.status = response.status;
  error.code = body?.error?.status || body?.error?.code || body?.error || "provider_error";
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) error.retryAfterMs = Number(retryAfter) * 1000;
  return error;
}
async function requestJson(fetchFn, url, token) {
  const response = await fetchFn(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response, body);
  return body;
}
function googleBirthday(person) {
  const date = person.birthdays?.[0]?.date;
  if (!date?.month || !date?.day) return null;
  return `${String(date.year || 0).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function createGoogleContactsAdapter({ fetchFn = fetch, getAccessToken }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchContactsPage({ account, cursor, mode }) {
      const token = await getAccessToken(account);
      const state = decode(cursor);
      const params = new URLSearchParams({ personFields: "names,emailAddresses,phoneNumbers,organizations,birthdays,photos,metadata", pageSize: "1000", sortOrder: "LAST_MODIFIED_DESCENDING" });
      if (state?.pageToken) params.set("pageToken", state.pageToken);
      if (mode === "incremental") {
        if (!state?.syncToken) throw new TypeError("Google contacts incremental cursor requires syncToken");
        params.set("syncToken", state.syncToken);
      } else {
        params.set("requestSyncToken", "true");
      }
      const body = await requestJson(fetchFn, `${GOOGLE_CONNECTIONS}?${params}`, token);
      const nextCursor = body.nextPageToken ? encode({ syncToken: state?.syncToken || null, pageToken: body.nextPageToken }) : null;
      return { items: body.connections || [], requestCursor: cursor, nextCursor, checkpoint: nextCursor ? null : encode({ syncToken: body.nextSyncToken || state?.syncToken }) };
    },
    normalizeContact(account, person) {
      const name = person.names?.[0] || {};
      const organization = person.organizations?.[0] || {};
      return {
        accountId: account.id,
        provider: "google",
        providerContactId: person.resourceName,
        displayName: name.displayName || "",
        givenName: name.givenName || null,
        familyName: name.familyName || null,
        emails: (person.emailAddresses || []).map((entry) => entry.value).filter(Boolean),
        phones: (person.phoneNumbers || []).map((entry) => entry.value).filter(Boolean),
        organization: organization.name || null,
        jobTitle: organization.title || null,
        birthday: googleBirthday(person),
        photoUrl: person.photos?.find((photo) => !photo.default)?.url || null,
        isDeleted: Boolean(person.metadata?.deleted),
        updatedAt: person.metadata?.sources?.[0]?.updateTime || new Date(0).toISOString(),
        rawRef: { resource: "google_people", resourceName: person.resourceName, etag: person.etag || null },
      };
    },
  };
}

export function createMicrosoftContactsAdapter({ fetchFn = fetch, getAccessToken }) {
  if (typeof getAccessToken !== "function") throw new TypeError("getAccessToken is required");
  return {
    async fetchContactsPage({ account, cursor }) {
      const token = await getAccessToken(account);
      const state = decode(cursor);
      const params = new URLSearchParams({ $select: "id,displayName,givenName,surname,emailAddresses,businessPhones,homePhones,mobilePhone,companyName,jobTitle,birthday,lastModifiedDateTime", $top: "100" });
      const url = state?.deltaUrl || `${GRAPH_CONTACTS_DELTA}?${params}`;
      const body = await requestJson(fetchFn, url, token);
      return { items: body.value || [], requestCursor: cursor, nextCursor: body["@odata.nextLink"] ? encode({ deltaUrl: body["@odata.nextLink"] }) : null, checkpoint: body["@odata.deltaLink"] ? encode({ deltaUrl: body["@odata.deltaLink"] }) : null };
    },
    normalizeContact(account, item) {
      return {
        accountId: account.id,
        provider: "microsoft",
        providerContactId: item.id,
        displayName: item.displayName || "",
        givenName: item.givenName || null,
        familyName: item.surname || null,
        emails: (item.emailAddresses || []).map((entry) => entry.address).filter(Boolean),
        phones: [...(item.businessPhones || []), ...(item.homePhones || []), item.mobilePhone].filter(Boolean),
        organization: item.companyName || null,
        jobTitle: item.jobTitle || null,
        birthday: item.birthday || null,
        photoUrl: null,
        isDeleted: Boolean(item["@removed"]),
        updatedAt: item.lastModifiedDateTime || new Date(0).toISOString(),
        rawRef: { resource: "graph_contacts", id: item.id },
      };
    },
  };
}

export const contactsCursor = Object.freeze({ encode, decode });
