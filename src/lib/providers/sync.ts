import { createAdminClient } from "@/lib/supabase/admin";
import { providerAccessToken } from "@/lib/providers/access-token";
import type { ProviderName } from "@/lib/providers/types";

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

async function googleJson(accessToken: string, url: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`GOOGLE_API_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function microsoftJson(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, prefer: 'outlook.timezone="UTC"' },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`MICROSOFT_GRAPH_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function googleHeader(headers: unknown, name: string): string | null {
  const match = asArray<Record<string, unknown>>(headers).find(h => String(h.name).toLowerCase() === name.toLowerCase());
  return match?.value ? String(match.value) : null;
}

function decodeBase64Url(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function limitBody(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\u0000/g, "").trim();
  return cleaned ? cleaned.slice(0, 250_000) : null;
}

function gmailBodyText(payload: unknown): string | null {
  const plain: string[] = [];
  const html: string[] = [];

  function visit(partValue: unknown) {
    if (!partValue || typeof partValue !== "object") return;
    const part = partValue as Record<string, unknown>;
    const mimeType = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : "";
    const body = part.body && typeof part.body === "object" ? part.body as Record<string, unknown> : null;
    const decoded = decodeBase64Url(body?.data);
    if (decoded && mimeType === "text/plain") plain.push(decoded);
    if (decoded && mimeType === "text/html") html.push(decoded);
    for (const child of asArray<Record<string, unknown>>(part.parts)) visit(child);
  }

  visit(payload);
  if (plain.length) return limitBody(plain.join("\n\n"));
  if (html.length) return limitBody(stripHtml(html.join("\n\n")));
  return null;
}

function microsoftBodyText(message: Record<string, unknown>): string | null {
  const body = message.body && typeof message.body === "object" ? message.body as Record<string, unknown> : null;
  const content = typeof body?.content === "string" ? body.content : null;
  if (!content) return null;
  return limitBody(String(body?.contentType).toLowerCase() === "html" ? stripHtml(content) : content);
}

export async function syncConnection(connectionId: string, userId: string, expectedProvider: ProviderName) {
  const admin = createAdminClient();
  const { data: connection, error } = await admin
    .from("provider_connections")
    .select("id, provider, profile_id, workspace_id, owner_id")
    .eq("id", connectionId)
    .eq("owner_id", userId)
    .single();
  if (error || !connection) throw new Error("CONNECTION_NOT_FOUND");
  if (connection.provider !== expectedProvider) throw new Error("PROVIDER_CONNECTION_MISMATCH");

  const staleBefore = new Date(Date.now() - 20 * 60_000).toISOString();
  await admin.from("sync_runs").update({
    status: "failed",
    completed_at: new Date().toISOString(),
    error_code: "STALE_SYNC_LEASE"
  }).eq("connection_id", connection.id).eq("status", "running").lt("started_at", staleBefore);

  const run = await admin.from("sync_runs").insert({
    connection_id: connection.id,
    owner_id: userId,
    status: "running",
    started_at: new Date().toISOString()
  }).select("id").single();
  if (run.error) {
    if (run.error.code === "23505") throw new Error("SYNC_ALREADY_RUNNING");
    throw new Error("SYNC_LEASE_FAILED");
  }

  await admin.from("provider_connections").update({
    status: "syncing",
    last_error: null,
    updated_at: new Date().toISOString()
  }).eq("id", connection.id).eq("owner_id", userId);

  try {
    const provider = connection.provider as ProviderName;
    const accessToken = await providerAccessToken(connection.id, provider);
    const counts = provider === "google"
      ? await syncGoogle(accessToken, connection)
      : await syncMicrosoft(accessToken, connection);

    await admin.from("provider_connections").update({
      status: "healthy",
      last_sync_at: new Date().toISOString(),
      last_error: null
    }).eq("id", connection.id);
    if (run.data?.id) await admin.from("sync_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      item_counts: counts
    }).eq("id", run.data.id);
    return counts;
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : "SYNC_FAILED";
    const reauth = message === "PROVIDER_REAUTH_REQUIRED"
      || /^(GOOGLE_TOKEN_REFRESH|MICROSOFT_TOKEN_REFRESH|GOOGLE_API_401|MICROSOFT_GRAPH_401)/.test(message);
    const publicCode = reauth ? "PROVIDER_REAUTH_REQUIRED" : "SYNC_FAILED";
    await admin.from("provider_connections").update({
      status: reauth ? "reauth_required" : "error",
      last_error: publicCode,
      updated_at: new Date().toISOString()
    }).eq("id", connection.id).eq("owner_id", userId);
    if (run.data?.id) await admin.from("sync_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: publicCode
    }).eq("id", run.data.id);
    throw syncError;
  }
}

async function syncGoogle(accessToken: string, connection: Record<string, string>) {
  const admin = createAdminClient();
  let mailCount = 0, calendarCount = 0, peopleCount = 0;

  const mailList = await googleJson(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=newer_than:30d");
  for (const row of asArray<Record<string, unknown>>(mailList.messages)) {
    const id = String(row.id);
    const message = await googleJson(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
    const payload = message.payload as Record<string, unknown> | undefined;
    const headers = payload?.headers;
    const internalDate = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
    const recipients = [googleHeader(headers, "To")].filter((value): value is string => Boolean(value));
    const { error } = await admin.from("communication_items").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "google",
      external_id: id,
      thread_external_id: message.threadId ? String(message.threadId) : null,
      channel: "email",
      direction: "inbound",
      subject: googleHeader(headers, "Subject"),
      sender: googleHeader(headers, "From"),
      recipients,
      preview: message.snippet ? String(message.snippet) : null,
      body_text: gmailBodyText(payload),
      occurred_at: internalDate,
      raw_metadata: { labelIds: message.labelIds || [] },
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    mailCount++;
  }

  const timeMin = new Date(Date.now() - 7 * 86400000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 86400000).toISOString();
  const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("timeMin", timeMin);
  calendarUrl.searchParams.set("timeMax", timeMax);
  calendarUrl.searchParams.set("maxResults", "100");
  const events = await googleJson(accessToken, calendarUrl.toString());
  for (const event of asArray<Record<string, unknown>>(events.items)) {
    const start = event.start as Record<string, unknown> | undefined;
    const end = event.end as Record<string, unknown> | undefined;
    const { error } = await admin.from("calendar_events").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "google",
      external_id: String(event.id),
      title: String(event.summary || "Untitled event"),
      description: event.description ? stripHtml(String(event.description)) : null,
      location: event.location ? String(event.location) : null,
      starts_at: String(start?.dateTime || start?.date || new Date().toISOString()),
      ends_at: String(end?.dateTime || end?.date || new Date().toISOString()),
      all_day: Boolean(start?.date && !start?.dateTime),
      attendees: asArray<Record<string, unknown>>(event.attendees).map(a => ({ email: a.email, responseStatus: a.responseStatus })),
      raw_metadata: { htmlLink: event.htmlLink || null },
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    calendarCount++;
  }

  const people = await googleJson(accessToken, "https://people.googleapis.com/v1/people/me/connections?pageSize=100&personFields=names,emailAddresses,phoneNumbers,organizations");
  for (const person of asArray<Record<string, unknown>>(people.connections)) {
    const names = asArray<Record<string, unknown>>(person.names);
    const emails = asArray<Record<string, unknown>>(person.emailAddresses);
    const phones = asArray<Record<string, unknown>>(person.phoneNumbers);
    const resourceName = String(person.resourceName || crypto.randomUUID());
    const { error } = await admin.from("people").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "google",
      external_id: resourceName,
      display_name: String(names[0]?.displayName || emails[0]?.value || "Contact"),
      email_addresses: emails.map(x => x.value).filter(Boolean),
      phone_numbers: phones.map(x => x.value).filter(Boolean),
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    peopleCount++;
  }
  return { mail: mailCount, calendar: calendarCount, people: peopleCount };
}

async function syncMicrosoft(accessToken: string, connection: Record<string, string>) {
  const admin = createAdminClient();
  let mailCount = 0, calendarCount = 0, peopleCount = 0;
  const messages = await microsoftJson(accessToken, "https://graph.microsoft.com/v1.0/me/messages?$top=30&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,bodyPreview,body,receivedDateTime,from,toRecipients,isRead,hasAttachments");
  for (const message of asArray<Record<string, unknown>>(messages.value)) {
    const from = message.from as Record<string, unknown> | undefined;
    const fromAddress = from?.emailAddress as Record<string, unknown> | undefined;
    const recipients = asArray<Record<string, unknown>>(message.toRecipients)
      .map(r => (r.emailAddress as Record<string, unknown> | undefined)?.address)
      .filter((value): value is string => typeof value === "string" && Boolean(value));
    const { error } = await admin.from("communication_items").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "microsoft",
      external_id: String(message.id),
      thread_external_id: message.conversationId ? String(message.conversationId) : null,
      channel: "email",
      direction: "inbound",
      subject: message.subject ? String(message.subject) : null,
      sender: fromAddress?.address ? String(fromAddress.address) : null,
      recipients,
      preview: message.bodyPreview ? String(message.bodyPreview) : null,
      body_text: microsoftBodyText(message),
      occurred_at: message.receivedDateTime ? String(message.receivedDateTime) : new Date().toISOString(),
      raw_metadata: { isRead: Boolean(message.isRead), hasAttachments: Boolean(message.hasAttachments) },
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    mailCount++;
  }

  const start = new Date(Date.now() - 7 * 86400000).toISOString();
  const end = new Date(Date.now() + 60 * 86400000).toISOString();
  const eventsUrl = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  eventsUrl.searchParams.set("startDateTime", start);
  eventsUrl.searchParams.set("endDateTime", end);
  eventsUrl.searchParams.set("$top", "100");
  eventsUrl.searchParams.set("$select", "id,subject,bodyPreview,start,end,location,attendees,isAllDay,webLink");
  const events = await microsoftJson(accessToken, eventsUrl.toString());
  for (const event of asArray<Record<string, unknown>>(events.value)) {
    const eventStart = event.start as Record<string, unknown> | undefined;
    const eventEnd = event.end as Record<string, unknown> | undefined;
    const location = event.location as Record<string, unknown> | undefined;
    const { error } = await admin.from("calendar_events").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "microsoft",
      external_id: String(event.id),
      title: String(event.subject || "Untitled event"),
      description: event.bodyPreview ? String(event.bodyPreview) : null,
      location: location?.displayName ? String(location.displayName) : null,
      starts_at: String(eventStart?.dateTime || new Date().toISOString()),
      ends_at: String(eventEnd?.dateTime || new Date().toISOString()),
      all_day: Boolean(event.isAllDay),
      attendees: asArray<Record<string, unknown>>(event.attendees),
      raw_metadata: { webLink: event.webLink || null },
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    calendarCount++;
  }

  const contacts = await microsoftJson(accessToken, "https://graph.microsoft.com/v1.0/me/contacts?$top=100&$select=id,displayName,emailAddresses,mobilePhone,businessPhones");
  for (const contact of asArray<Record<string, unknown>>(contacts.value)) {
    const emailAddresses = asArray<Record<string, unknown>>(contact.emailAddresses).map(e => e.address).filter(Boolean);
    const businessPhones = asArray<string>(contact.businessPhones);
    const phoneNumbers = [contact.mobilePhone, ...businessPhones].filter(Boolean);
    const { error } = await admin.from("people").upsert({
      owner_id: connection.owner_id,
      workspace_id: connection.workspace_id,
      profile_id: connection.profile_id,
      connection_id: connection.id,
      provider: "microsoft",
      external_id: String(contact.id),
      display_name: String(contact.displayName || emailAddresses[0] || "Contact"),
      email_addresses: emailAddresses,
      phone_numbers: phoneNumbers,
      updated_at: new Date().toISOString()
    }, { onConflict: "provider,connection_id,external_id" });
    if (error) throw new Error("SYNC_WRITE_FAILED");
    peopleCount++;
  }
  return { mail: mailCount, calendar: calendarCount, people: peopleCount };
}
