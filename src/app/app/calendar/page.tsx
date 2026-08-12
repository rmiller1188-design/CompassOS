import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShareEventToUsButton } from "@/components/share-event-to-us-button";
import { EventUtilityActions } from "@/components/event-utility-actions";

export const dynamic = "force-dynamic";

type CalendarEvent = {
  id: string;
  provider: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  all_day: boolean;
  attendees: unknown;
  raw_metadata: unknown;
};

type JoinedWorkspace = { id: string; kind: string };

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function attendeeLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const emailAddress = row.emailAddress && typeof row.emailAddress === "object" ? row.emailAddress as Record<string, unknown> : null;
  const name = typeof row.displayName === "string" ? row.displayName : typeof row.name === "string" ? row.name : typeof emailAddress?.name === "string" ? emailAddress.name : null;
  const email = typeof row.email === "string" ? row.email : typeof emailAddress?.address === "string" ? emailAddress.address : null;
  return name && email ? `${name} <${email}>` : name || email;
}

function eventMetadata(event: CalendarEvent): Record<string, unknown> {
  return event.raw_metadata && typeof event.raw_metadata === "object"
    ? event.raw_metadata as Record<string, unknown>
    : {};
}

function providerEventLink(event: CalendarEvent): string | null {
  const raw = eventMetadata(event);
  const candidate = typeof raw.htmlLink === "string" ? raw.htmlLink : typeof raw.webLink === "string" ? raw.webLink : null;
  return candidate?.startsWith("https://") ? candidate : null;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const admin = createAdminClient();
  const [eventResult, membershipResult] = await Promise.all([
    admin
      .from("calendar_events")
      .select("id,provider,title,description,starts_at,ends_at,location,all_day,attendees,raw_metadata")
      .eq("owner_id", user.id)
      .neq("provider", "shared")
      .order("starts_at")
      .limit(250),
    admin
      .from("workspace_members")
      .select("workspace_id,workspaces(id,kind)")
      .eq("user_id", user.id)
  ]);

  const events = (eventResult.data || []) as CalendarEvent[];
  const hasSharedWorkspace = (membershipResult.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    const workspaces = Array.isArray(joined) ? joined : joined ? [joined] : [];
    return workspaces.some(workspace => workspace.kind === "shared");
  });
  const requestedId = firstParam(params.event);
  const selected = events.find(event => event.id === requestedId) || events[0] || null;
  const attendees = Array.isArray(selected?.attendees)
    ? selected.attendees.map(attendeeLabel).filter((value): value is string => Boolean(value))
    : [];
  const externalLink = selected ? providerEventLink(selected) : null;
  const selectedMetadata = selected ? eventMetadata(selected) : {};
  const calendarName = typeof selectedMetadata.calendarName === "string" ? selectedMetadata.calendarName : null;

  return (
    <div className="content-stack">
      <section className="card page-intro">
        <p className="eyebrow">Combined private view</p>
        <h1>Your calendar</h1>
        <p className="muted">Select an imported event to view details, create a private follow-up, copy the schedule, open the provider event, or explicitly share it into Us.</p>
      </section>
      <div className="two-pane calendar-two-pane">
        <section className="card list-pane">
          <div className="section-heading"><div><p className="eyebrow">Upcoming and recent</p><h2>Events</h2></div><span className="pill" title="Imported event count">{events.length}</span></div>
          <div className="event-list">
            {events.length ? events.map(event => {
              const active = selected?.id === event.id;
              const metadata = eventMetadata(event);
              const sourceCalendar = typeof metadata.calendarName === "string" ? metadata.calendarName : null;
              return (
                <Link className={`event-row selectable-row${active ? " selected" : ""}`} href={`/app/calendar?event=${event.id}`} key={event.id} aria-current={active ? "page" : undefined}>
                  <span className={`provider-icon ${event.provider}`}>{event.provider === "google" ? "G" : "M"}</span>
                  <div>
                    <b>{event.title}</b>
                    <p>{new Date(event.starts_at).toLocaleString()} — {new Date(event.ends_at).toLocaleString()}</p>
                    <small>{sourceCalendar ? `${sourceCalendar} • ` : ""}{event.location || (event.all_day ? "All day" : "No location")}</small>
                  </div>
                  <span className="row-chevron" aria-hidden="true">›</span>
                </Link>
              );
            }) : (
              <div className="empty-inline">
                <b>No calendar events imported</b>
                <p>Connect Google or Microsoft and run the first sync.</p>
                <Link className="button primary" href="/app/settings/connections">Connect or sync an account</Link>
              </div>
            )}
          </div>
        </section>
        <section className="card detail-pane">
          {selected ? (
            <div className="detail-stack">
              <div className="detail-header">
                <div><p className="eyebrow">{calendarName || `${selected.provider} calendar`}</p><h1>{selected.title}</h1></div>
                <span className="pill" title="Event schedule type">{selected.all_day ? "All day" : "Scheduled"}</span>
              </div>
              <div className="detail-meta calendar-meta">
                <div><small>Starts</small><b>{new Date(selected.starts_at).toLocaleString()}</b></div>
                <div><small>Ends</small><b>{new Date(selected.ends_at).toLocaleString()}</b></div>
                <div><small>Location</small><b>{selected.location || "No location provided"}</b></div>
              </div>
              <section className="detail-section">
                <h2>Description</h2>
                <div className="message-body">{selected.description || "No description provided for this event."}</div>
              </section>
              <section className="detail-section">
                <div className="section-heading"><h2>Attendees</h2><span className="pill" title="Imported attendee count">{attendees.length}</span></div>
                {attendees.length ? <ul className="attendee-list">{attendees.map(attendee => <li key={attendee}>{attendee}</li>)}</ul> : <p className="muted">No attendees were included in the provider response.</p>}
              </section>
              <EventUtilityActions eventId={selected.id} title={selected.title} startsAt={selected.starts_at} endsAt={selected.ends_at} location={selected.location} description={selected.description}/>
              <div className="detail-actions action-bar">
                <div className="action-cluster">
                  {externalLink && <a className="button secondary" href={externalLink} target="_blank" rel="noreferrer">Open in {selected.provider === "google" ? "Google Calendar" : "Outlook"}</a>}
                </div>
                {hasSharedWorkspace ? (
                  <ShareEventToUsButton eventId={selected.id}/>
                ) : (
                  <div className="action-cluster">
                    <Link className="button primary" href="/app/us">Create Us to share</Link>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state compact"><span className="empty-icon">◫</span><h2>Select an event</h2><p>Choose a calendar event from the list to open its details.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
