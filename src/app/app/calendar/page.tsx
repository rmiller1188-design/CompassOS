import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShareEventToUsButton } from "@/components/share-event-to-us-button";
import { EventUtilityActions } from "@/components/event-utility-actions";
import styles from "./calendar.module.css";

export const dynamic = "force-dynamic";

type SourceKey = "all" | "outlook" | "google";
type CalendarEvent = {
  id: string;
  provider: string;
  connection_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  all_day: boolean;
  attendees: unknown;
  raw_metadata: unknown;
};
type Connection = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string;
  status: string;
  last_sync_at: string | null;
};
type JoinedWorkspace = { id: string; kind: string };

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function sourceFromParam(value: string | null): SourceKey {
  return value === "outlook" || value === "google" ? value : "all";
}

function belongsToSource(event: CalendarEvent, source: SourceKey): boolean {
  if (source === "outlook") return event.provider === "microsoft";
  if (source === "google") return event.provider === "google";
  return true;
}

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Google Calendar" : provider;
}

function buildCalendarHref(source: SourceKey, event?: string | null, account?: string | null): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (account) params.set("account", account);
  if (event) params.set("event", event);
  const query = params.toString();
  return query ? `/app/calendar?${query}` : "/app/calendar";
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
  return event.raw_metadata && typeof event.raw_metadata === "object" ? event.raw_metadata as Record<string, unknown> : {};
}

function providerEventLink(event: CalendarEvent): string | null {
  const raw = eventMetadata(event);
  const candidate = typeof raw.htmlLink === "string" ? raw.htmlLink : typeof raw.webLink === "string" ? raw.webLink : null;
  return candidate?.startsWith("https://") ? candidate : null;
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = Date.now();
  return [...events].sort((a, b) => {
    const aTime = new Date(a.starts_at).getTime();
    const bTime = new Date(b.starts_at).getTime();
    const aFuture = aTime >= now;
    const bFuture = bTime >= now;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? aTime - bTime : bTime - aTime;
  });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const source = sourceFromParam(firstParam(params.source));
  const requestedAccount = firstParam(params.account);
  const requestedId = firstParam(params.event);
  const admin = createAdminClient();

  const [eventResult, connectionResult, membershipResult] = await Promise.all([
    admin
      .from("calendar_events")
      .select("id,provider,connection_id,title,description,starts_at,ends_at,location,all_day,attendees,raw_metadata")
      .eq("owner_id", user.id)
      .neq("provider", "shared")
      .order("starts_at", { ascending: false })
      .limit(250),
    admin
      .from("provider_connections")
      .select("id,provider,account_email,status,last_sync_at")
      .eq("owner_id", user.id)
      .order("provider")
      .order("account_email"),
    admin
      .from("workspace_members")
      .select("workspace_id,workspaces(id,kind)")
      .eq("user_id", user.id)
  ]);

  const allEvents = sortEvents((eventResult.data || []) as CalendarEvent[]);
  const connections = (connectionResult.data || []) as Connection[];
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));
  const hasSharedWorkspace = (membershipResult.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    const workspaces = Array.isArray(joined) ? joined : joined ? [joined] : [];
    return workspaces.some(workspace => workspace.kind === "shared");
  });

  const sourceConnections = source === "google"
    ? connections.filter(connection => connection.provider === "google")
    : source === "outlook"
      ? connections.filter(connection => connection.provider === "microsoft")
      : [];
  const validAccount = requestedAccount && sourceConnections.some(connection => connection.id === requestedAccount) ? requestedAccount : null;
  const sourceEvents = allEvents.filter(event => belongsToSource(event, source));
  const events = validAccount ? sourceEvents.filter(event => event.connection_id === validAccount) : sourceEvents;
  const selected = events.find(event => event.id === requestedId) || events[0] || null;
  const selectedConnection = selected?.connection_id ? connectionById.get(selected.connection_id) || null : null;
  const attendees = Array.isArray(selected?.attendees) ? selected.attendees.map(attendeeLabel).filter((value): value is string => Boolean(value)) : [];
  const externalLink = selected ? providerEventLink(selected) : null;
  const selectedMetadata = selected ? eventMetadata(selected) : {};
  const calendarName = typeof selectedMetadata.calendarName === "string" ? selectedMetadata.calendarName : null;
  const counts = {
    all: allEvents.length,
    outlook: allEvents.filter(event => event.provider === "microsoft").length,
    google: allEvents.filter(event => event.provider === "google").length
  };
  const showingDetailOnMobile = Boolean(requestedId && selected);

  return (
    <div className={styles.page}>
      <section className={`${styles.header} card`}>
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Know which calendar you are looking at.</h1>
          <p>Keep Outlook and Google schedules distinct, then use All only when you want the combined operating picture.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className="button secondary" href="/app/settings/connections">Manage accounts</Link>
          {hasSharedWorkspace && <Link className="button secondary" href="/app/us">Open Us</Link>}
        </div>
      </section>

      <nav className={styles.sourceSwitcher} aria-label="Calendar source">
        <SourceTab source="all" active={source} label="All calendars" icon="✦" count={counts.all}/>
        <SourceTab source="outlook" active={source} label="Outlook" icon="O" count={counts.outlook}/>
        <SourceTab source="google" active={source} label="Google" icon="G" count={counts.google}/>
      </nav>

      {(source === "google" || source === "outlook") && (
        <section className={`${styles.accountStrip} card`}>
          <div className={styles.accountLead}>
            <span className={`${styles.sourceIcon} ${source === "google" ? styles.google : styles.outlook}`}>{source === "google" ? "G" : "O"}</span>
            <span><b>{source === "google" ? "Google calendar accounts" : "Outlook calendar accounts"}</b><small>Select one account or keep the provider combined.</small></span>
          </div>
          <div className={styles.accountChips}>
            <Link className={`${styles.accountChip}${!validAccount ? ` ${styles.active}` : ""}`} href={buildCalendarHref(source)}>All {source === "google" ? "Google" : "Outlook"}</Link>
            {sourceConnections.map(connection => (
              <Link className={`${styles.accountChip}${validAccount === connection.id ? ` ${styles.active}` : ""}`} href={buildCalendarHref(source, null, connection.id)} key={connection.id}>
                <span className={`${styles.healthDot} ${styles[connection.status] || ""}`}/>{connection.account_email}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className={styles.twoPane}>
        <section className={`card ${styles.listPane}${showingDetailOnMobile ? ` ${styles.hideOnMobile}` : ""}`}>
          <div className="section-heading">
            <div><p className="eyebrow">{source === "all" ? "All sources" : source === "outlook" ? "Microsoft" : "Google"}</p><h2>{source === "all" ? "Events" : source === "outlook" ? "Outlook calendar" : "Google calendar"}</h2>{validAccount && <small>{connectionById.get(validAccount)?.account_email}</small>}</div>
            <span className="pill">{events.length}</span>
          </div>
          <div className={styles.eventList}>
            {events.length ? events.map(event => {
              const active = selected?.id === event.id;
              const metadata = eventMetadata(event);
              const sourceCalendar = typeof metadata.calendarName === "string" ? metadata.calendarName : null;
              const connection = event.connection_id ? connectionById.get(event.connection_id) : null;
              const tone = event.provider === "google" ? styles.google : styles.outlook;
              return (
                <Link className={`${styles.eventRow}${active ? ` ${styles.selected}` : ""}`} href={buildCalendarHref(source, event.id, validAccount)} key={event.id} aria-current={active ? "page" : undefined}>
                  <span className={`${styles.providerIcon} ${tone}`}>{event.provider === "google" ? "G" : "O"}</span>
                  <span className={styles.eventCopy}>
                    <span className={styles.sourceLine}><span>{providerLabel(event.provider)}</span>{connection?.account_email && <small>{connection.account_email}</small>}</span>
                    <b>{event.title}</b>
                    <p>{new Date(event.starts_at).toLocaleString()} — {new Date(event.ends_at).toLocaleString()}</p>
                    <small>{sourceCalendar ? `${sourceCalendar} · ` : ""}{event.location || (event.all_day ? "All day" : "No location")}</small>
                  </span>
                  <span className={styles.chevron} aria-hidden="true">›</span>
                </Link>
              );
            }) : <div className={styles.empty}><b>No events in this source</b><p>Run Sync now for the selected account, or manage calendar connections.</p><Link className="button primary" href="/app/settings/connections">Manage connections</Link></div>}
          </div>
        </section>

        <section className={`card ${styles.detailPane}${showingDetailOnMobile ? ` ${styles.showOnMobile}` : ""}`}>
          {selected ? (
            <div className="detail-stack">
              <Link className={styles.mobileBack} href={buildCalendarHref(source, null, validAccount)}>← Back to calendar</Link>
              <div className={styles.contextBanner}>
                <span className={`${styles.providerIcon} ${selected.provider === "google" ? styles.google : styles.outlook}`}>{selected.provider === "google" ? "G" : "O"}</span>
                <span><small>You are viewing</small><b>{providerLabel(selected.provider)}{selectedConnection?.account_email ? ` · ${selectedConnection.account_email}` : ""}</b></span>
                {selectedConnection && <span className={`status ${selectedConnection.status}`}>{selectedConnection.status.replace("_", " ")}</span>}
              </div>
              <div className="detail-header">
                <div><p className="eyebrow">{calendarName || `${providerLabel(selected.provider)} calendar`}</p><h1>{selected.title}</h1></div>
                <span className="pill">{selected.all_day ? "All day" : "Scheduled"}</span>
              </div>
              <div className="detail-meta calendar-meta">
                <div><small>Starts</small><b>{new Date(selected.starts_at).toLocaleString()}</b></div>
                <div><small>Ends</small><b>{new Date(selected.ends_at).toLocaleString()}</b></div>
                <div><small>Location</small><b>{selected.location || "No location provided"}</b></div>
              </div>
              <section className="detail-section"><h2>Description</h2><div className="message-body">{selected.description || "No description provided for this event."}</div></section>
              <section className="detail-section">
                <div className="section-heading"><h2>Attendees</h2><span className="pill">{attendees.length}</span></div>
                {attendees.length ? <ul className="attendee-list">{attendees.map(attendee => <li key={attendee}>{attendee}</li>)}</ul> : <p className="muted">No attendees were included in the provider response.</p>}
              </section>
              <EventUtilityActions eventId={selected.id} title={selected.title} startsAt={selected.starts_at} endsAt={selected.ends_at} location={selected.location} description={selected.description}/>
              <div className="detail-actions action-bar">
                <div className="action-cluster">{externalLink && <a className="button secondary" href={externalLink} target="_blank" rel="noreferrer">Open in {selected.provider === "google" ? "Google Calendar" : "Outlook"}</a>}</div>
                {hasSharedWorkspace ? <ShareEventToUsButton eventId={selected.id}/> : <div className="action-cluster"><Link className="button primary" href="/app/us">Create Us to share</Link></div>}
              </div>
            </div>
          ) : <div className="empty-state compact"><span className="empty-icon">◷</span><h2>Select an event</h2><p>Choose a calendar event from the selected source.</p></div>}
        </section>
      </div>
    </div>
  );
}

function SourceTab({ source, active, label, icon, count }: { source: SourceKey; active: SourceKey; label: string; icon: string; count: number }) {
  const tone = source === "google" ? styles.google : source === "outlook" ? styles.outlook : "";
  return <Link className={`${styles.sourceTab}${active === source ? ` ${styles.active}` : ""}`} href={buildCalendarHref(source)} aria-current={active === source ? "page" : undefined}><span className={`${styles.sourceIcon}${tone ? ` ${tone}` : ""}`}>{icon}</span><span><b>{label}</b><small>{source === "all" ? "Combined private view" : "Provider view"}</small></span><span className={styles.sourceCount}>{count}</span></Link>;
}
