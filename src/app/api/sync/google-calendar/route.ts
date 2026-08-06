import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerAccessToken } from "@/lib/providers/access-token";

const bodySchema = z.object({ connectionId: z.string().uuid() });
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

type GoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
  timeZone: string | null;
};

async function googleJson(accessToken: string, url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Google Calendar API request failed", response.status, body.slice(0, 800));
    throw new Error(`GOOGLE_CALENDAR_API_${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
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
    .trim()
    .slice(0, 250_000) || null;
}

async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const calendars: GoogleCalendar[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("showHidden", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const json = await googleJson(accessToken, url.toString());
    for (const row of asArray<Record<string, unknown>>(json.items)) {
      if (typeof row.id !== "string" || !row.id || row.deleted === true) continue;
      calendars.push({
        id: row.id,
        summary: typeof row.summary === "string" && row.summary ? row.summary : row.id,
        primary: row.primary === true,
        accessRole: typeof row.accessRole === "string" ? row.accessRole : null,
        timeZone: typeof row.timeZone === "string" ? row.timeZone : null
      });
    }
    pageToken = typeof json.nextPageToken === "string" && json.nextPageToken ? json.nextPageToken : null;
  } while (pageToken);

  return calendars;
}

async function listCalendarEvents(accessToken: string, calendarId: string): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  const timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 86_400_000).toISOString();

  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const json = await googleJson(accessToken, url.toString());
    events.push(...asArray<Record<string, unknown>>(json.items));
    pageToken = typeof json.nextPageToken === "string" && json.nextPageToken ? json.nextPageToken : null;
  } while (pageToken);

  return events;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { connectionId } = bodySchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: connection, error } = await admin
      .from("provider_connections")
      .select("id,provider,profile_id,workspace_id,owner_id")
      .eq("id", connectionId)
      .eq("owner_id", user.id)
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: "connection_not_found" }, { status: 404 });
    }
    if (connection.provider !== "google") {
      return NextResponse.json({ error: "provider_connection_mismatch" }, { status: 400 });
    }

    const accessToken = await providerAccessToken(connection.id, "google");
    const calendars = await listCalendars(accessToken);
    let eventCount = 0;

    for (const calendar of calendars) {
      const events = await listCalendarEvents(accessToken, calendar.id);
      for (const event of events) {
        if (typeof event.id !== "string" || !event.id) continue;
        const start = event.start && typeof event.start === "object" ? event.start as Record<string, unknown> : null;
        const end = event.end && typeof event.end === "object" ? event.end as Record<string, unknown> : null;
        const startsAt = start?.dateTime || start?.date;
        const endsAt = end?.dateTime || end?.date;
        if (typeof startsAt !== "string" || typeof endsAt !== "string") continue;

        const externalId = calendar.primary ? event.id : `${calendar.id}:${event.id}`;
        const attendees = asArray<Record<string, unknown>>(event.attendees).map(attendee => ({
          email: attendee.email || null,
          displayName: attendee.displayName || null,
          responseStatus: attendee.responseStatus || null,
          organizer: Boolean(attendee.organizer),
          self: Boolean(attendee.self)
        }));

        const write = await admin.from("calendar_events").upsert({
          owner_id: connection.owner_id,
          workspace_id: connection.workspace_id,
          profile_id: connection.profile_id,
          connection_id: connection.id,
          provider: "google",
          external_id: externalId,
          title: String(event.summary || "Untitled event"),
          description: cleanDescription(event.description),
          location: typeof event.location === "string" ? event.location : null,
          starts_at: startsAt,
          ends_at: endsAt,
          all_day: Boolean(start?.date && !start?.dateTime),
          attendees,
          raw_metadata: {
            htmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null,
            calendarId: calendar.id,
            calendarName: calendar.summary,
            calendarPrimary: calendar.primary,
            calendarAccessRole: calendar.accessRole,
            calendarTimeZone: calendar.timeZone,
            eventStatus: typeof event.status === "string" ? event.status : null
          },
          updated_at: new Date().toISOString()
        }, { onConflict: "provider,connection_id,external_id" });

        if (write.error) {
          console.error("Google calendar event write failed", write.error.code, write.error.message);
          throw new Error("GOOGLE_CALENDAR_WRITE_FAILED");
        }
        eventCount++;
      }
    }

    return NextResponse.json({ synced: true, counts: { calendars: calendars.length, calendar: eventCount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "PROVIDER_REAUTH_REQUIRED" || message === "GOOGLE_TOKEN_REFRESH_401") {
      return NextResponse.json({ error: "provider_reauthorization_required" }, { status: 409 });
    }
    if (message === "GOOGLE_CALENDAR_API_403") {
      return NextResponse.json({ error: "google_calendar_scope_required" }, { status: 403 });
    }
    console.error("Google all-calendar sync failed", message || error);
    return NextResponse.json({ error: "google_calendar_sync_failed" }, { status: 500 });
  }
}
