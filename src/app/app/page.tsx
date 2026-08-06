import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DailyBrief } from "@/components/daily-brief";
import { TaskBoard } from "@/components/task-board";

export const dynamic = "force-dynamic";

type JoinedWorkspace = {
  id?: string;
  name?: string;
  kind?: string;
};

type HomeTask = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
};

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id,display_name,personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single();
  if (!profile) return <SetupRequired />;

  const [connections, unread, events, sharedWorkspaces, taskResult] = await Promise.all([
    admin.from("provider_connections").select("id,status,last_sync_at").eq("owner_id", user.id),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("direction", "inbound"),
    admin.from("calendar_events").select("id,title,starts_at").eq("workspace_id", profile.personal_workspace_id).neq("provider", "shared").gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
    admin.from("workspace_members").select("workspace_id,workspaces(id,name,kind)").eq("user_id", user.id),
    admin.from("shared_tasks").select("id,title,notes,status,due_at,created_at").eq("workspace_id", profile.personal_workspace_id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50)
  ]);

  const connectionRows = connections.data || [];
  const healthy = connectionRows.filter(connection => connection.status === "healthy").length;
  const nextEvent = events.data?.[0];
  const personalTasks = (taskResult.data || []) as HomeTask[];
  const hasSharedWorkspace = (sharedWorkspaces.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    return Array.isArray(joined)
      ? joined.some(workspace => workspace?.kind === "shared")
      : joined?.kind === "shared";
  });

  return (
    <div className="dashboard-grid">
      {!connectionRows.length && (
        <section className="card span-12">
          <p className="eyebrow">First-run setup</p>
          <h1>Connect one account to activate Compass</h1>
          <p className="muted">The inbox, calendar, people search, and daily summary remain empty until Google or Microsoft is connected and the first sync completes.</p>
          <div className="button-row">
            <Link className="button primary" href="/app/settings/connections">Connect Google or Microsoft</Link>
            <Link className="button secondary" href="/app/files">Test private file upload</Link>
            <Link className="button secondary" href="/app/us">Create an Us workspace</Link>
          </div>
        </section>
      )}
      {!!connectionRows.length && !healthy && (
        <section className="card span-12">
          <p className="eyebrow">Connection needs attention</p>
          <h2>Run the first sync or reconnect the account</h2>
          <p className="muted">Compass has a provider record, but no healthy connection is currently supplying data.</p>
          <Link className="button primary" href="/app/settings/connections">Open account health</Link>
        </section>
      )}
      <DailyBrief workspaceId={profile.personal_workspace_id} />
      <section className="card metric-card span-4">
        <span className="metric-label">Connected accounts</span>
        <b className="metric-value">{healthy}</b>
        <p>{healthy ? "Google or Microsoft connections are healthy." : "No healthy provider connection yet."}</p>
        <Link className="text-link" href="/app/settings/connections">Manage accounts</Link>
      </section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Messages</p><h2>Recent attention</h2></div><Link className="pill interactive-pill" href="/app/messages" title="Open imported messages">{unread.count || 0} imported</Link></div>
        <p className="muted">Open full imported message details, generate a quick summary or local draft, and convert any message into a private or shared follow-up.</p>
        <Link className="button secondary" href="/app/messages">Open messages</Link>
      </section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Calendar</p><h2>{nextEvent ? nextEvent.title : "No upcoming event"}</h2></div>{nextEvent && <Link className="pill interactive-pill" href={`/app/calendar?event=${nextEvent.id}`} title="Open this event">{new Date(nextEvent.starts_at).toLocaleString()}</Link>}</div>
        <p className="muted">Review imported event details and explicitly share selected events into Us.</p>
        <Link className="button secondary" href="/app/calendar">Open calendar</Link>
      </section>
      <section className="card span-6" id="private-tasks">
        <div className="section-heading"><div><p className="eyebrow">Follow-ups</p><h2>Private tasks</h2></div><span className="metric-label">{personalTasks.filter(task => task.status !== "done").length} currently open</span></div>
        <TaskBoard workspaceId={profile.personal_workspace_id} initialTasks={personalTasks} compact/>
      </section>
      <section className="card span-6">
        <p className="eyebrow">Us</p>
        <h2>Shared household space</h2>
        <p className="muted">{hasSharedWorkspace ? "Shared schedule and household tasks are active." : "Create an Us workspace and invite your partner."}</p>
        <Link className="button secondary" href="/app/us">Open Us</Link>
      </section>
      <section className="card span-6">
        <p className="eyebrow">Files</p>
        <h2>Private cloud file storage</h2>
        <p className="muted">Upload files privately, open them securely, download copies, and delete them with confirmation.</p>
        <Link className="button secondary" href="/app/files">Open files</Link>
      </section>
    </div>
  );
}

function SetupRequired() {
  return <section className="card empty-state"><h1>Finish database setup</h1><p>Run the M26 Supabase migrations, then sign out and sign back in. Compass will create your private profile and personal workspace automatically.</p><Link className="button primary" href="/app/settings/connections">Open setup</Link></section>;
}
