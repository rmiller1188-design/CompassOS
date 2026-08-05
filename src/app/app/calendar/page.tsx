import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("calendar_events")
    .select("id,provider,title,starts_at,ends_at,location,all_day")
    .eq("owner_id", user.id)
    .order("starts_at")
    .limit(100);

  return (
    <div className="content-stack">
      <section className="card page-intro">
        <p className="eyebrow">Combined private view</p>
        <h1>Your calendar</h1>
        <p className="muted">This screen combines connected Google and Microsoft calendars. Sharing into Us is a separate feature and is not implemented yet.</p>
      </section>
      <section className="card">
        <div className="event-list">
          {events?.length ? events.map(event => (
            <article className="event-row" key={event.id}>
              <span className={`provider-icon ${event.provider}`}>{event.provider === "google" ? "G" : "M"}</span>
              <div>
                <b>{event.title}</b>
                <p>{new Date(event.starts_at).toLocaleString()} — {new Date(event.ends_at).toLocaleString()}</p>
                <small>{event.location || (event.all_day ? "All day" : "No location")}</small>
              </div>
              <button className="button secondary" disabled title="Calendar sharing is not implemented yet">Share to Us</button>
            </article>
          )) : (
            <div className="empty-inline">
              <b>No calendar events imported</b>
              <p>Connect Google or Microsoft and run the first sync.</p>
              <Link className="button primary" href="/app/settings/connections">Connect or sync an account</Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
