import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DailyBrief } from "@/components/daily-brief";

export const dynamic = "force-dynamic";

type JoinedWorkspace = {
  id?: string;
  name?: string;
  kind?: string;
};

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id,display_name,personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single();
  if (!profile) return <SetupRequired />;

  const [connections, unread, events, sharedWorkspaces] = await Promise.all([
    admin.from("provider_connections").select("id,status,last_sync_at").eq("owner_id", user.id),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("direction", "inbound"),
    admin.from("calendar_events").select("id,title,starts_at").eq("owner_id", user.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
    admin.from("workspace_members").select("workspace_id,workspaces(id,name,kind)").eq("user_id", user.id)
  ]);

  const healthy = (connections.data || []).filter(connection => connection.status === "healthy").length;
  const nextEvent = events.data?.[0];
  const hasSharedWorkspace = (sharedWorkspaces.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    return Array.isArray(joined)
      ? joined.some(workspace => workspace?.kind === "shared")
      : joined?.kind === "shared";
  });

  return (
    <div className="dashboard-grid">
      <DailyBrief workspaceId={profile.personal_workspace_id} />
      <section className="card metric-card span-4">
        <span className="metric-label">Connected accounts</span>
        <b className="metric-value">{healthy}</b>
        <p>{healthy ? "Google or Microsoft connections are healthy." : "Connect your first account."}</p>
        <Link className="text-link" href="/app/settings/connections">Manage accounts</Link>
      </section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Messages</p><h2>Recent attention</h2></div><span className="pill">{unread.count || 0} imported</span></div>
        <p className="muted">Synced email and selected phone-share items appear here. No provider can send without a separate approval scope.</p>
        <Link className="button secondary" href="/app/messages">Open messages</Link>
      </section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Calendar</p><h2>{nextEvent ? nextEvent.title : "No upcoming event"}</h2></div>{nextEvent && <span className="pill">{new Date(nextEvent.starts_at).toLocaleString()}</span>}</div>
        <p className="muted">Your calendar remains private unless you explicitly share an event or availability window into Us.</p>
        <Link className="button secondary" href="/app/calendar">Open calendar</Link>
      </section>
      <section className="card span-6">
        <p className="eyebrow">Us</p>
        <h2>Shared household space</h2>
        <p className="muted">{hasSharedWorkspace ? "Your shared workspace is active." : "Invite your partner and create an Us workspace."}</p>
        <Link className="button secondary" href="/app/us">Open Us</Link>
      </section>
      <section className="card span-6">
        <p className="eyebrow">Files</p>
        <h2>Cloud file storage</h2>
        <p className="muted">Photos, videos, PDFs, and documents are stored in private Supabase Storage with workspace-based access control.</p>
        <Link className="button secondary" href="/app/files">Open files</Link>
      </section>
    </div>
  );
}

function SetupRequired() {
  return <section className="card empty-state"><h1>Finish database setup</h1><p>Run the M26 Supabase migrations, then sign out and sign back in. Compass will create your private profile and personal workspace automatically.</p><Link className="button primary" href="/app/settings/connections">Open setup</Link></section>;
}
