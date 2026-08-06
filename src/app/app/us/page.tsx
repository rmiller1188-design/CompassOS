import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvitePartnerForm } from "@/components/invite-partner-form";
import { CreateUsWorkspace } from "@/components/create-us-workspace";
import { TaskBoard } from "@/components/task-board";

export const dynamic = "force-dynamic";

type SharedWorkspace = {
  id: string;
  name: string;
  kind: string;
  created_by: string;
};

type SharedEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  raw_metadata: unknown;
};

type SharedTask = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
};

function sourceEventId(event: SharedEvent): string | null {
  if (!event.raw_metadata || typeof event.raw_metadata !== "object") return null;
  const value = (event.raw_metadata as Record<string, unknown>).sharedFromEventId;
  return typeof value === "string" && value ? value : null;
}

function SharedEventContent({ event }: { event: SharedEvent }) {
  return (
    <>
      <div className="shared-date"><b>{new Date(event.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b><small>{event.all_day ? "All day" : new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>
      <div><b>{event.title}</b><p>{event.location || "No location"}</p>{event.description && <small>{event.description}</small>}</div>
      <span className="row-chevron" aria-hidden="true">›</span>
    </>
  );
}

export default async function UsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("workspace_members")
    .select("role,workspaces(id,name,kind,created_by)")
    .eq("user_id", user.id);

  const availableWorkspaces = (memberships || []).flatMap(row => {
    const joined = row.workspaces as SharedWorkspace | SharedWorkspace[] | null;
    if (!joined) return [];
    return Array.isArray(joined) ? joined : [joined];
  });
  const shared = availableWorkspaces.find(workspace => workspace.kind === "shared");

  if (!shared) {
    return (
      <div className="content-stack">
        <section className="card page-intro">
          <p className="eyebrow">Shared by consent</p>
          <h1>Create your Us space</h1>
          <p className="muted">Your partner receives their own account. Private mail, calendars, contacts, files, and memory never become shared automatically.</p>
        </section>
        <section className="card">
          <h2>Create the shared workspace</h2>
          <p className="muted">This creates the common space first. Then you can invite your partner by email.</p>
          <CreateUsWorkspace />
        </section>
      </div>
    );
  }

  const [eventResult, taskResult] = await Promise.all([
    admin.from("calendar_events")
      .select("id,title,description,location,starts_at,ends_at,all_day,raw_metadata")
      .eq("workspace_id", shared.id)
      .eq("provider", "shared")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(30),
    admin.from("shared_tasks")
      .select("id,title,notes,status,due_at,created_at")
      .eq("workspace_id", shared.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  const sharedEvents = (eventResult.data || []) as SharedEvent[];
  const sharedTasks = (taskResult.data || []) as SharedTask[];

  return (
    <div className="dashboard-grid">
      <section className="card hero-card span-8">
        <p className="eyebrow">Us</p>
        <h1>{shared.name}</h1>
        <p className="muted">Only selected events, tasks, and files enter this workspace. Private provider data remains separate.</p>
        <div className="us-metrics">
          <span><b>{sharedEvents.length}</b><small>upcoming shared events</small></span>
          <span><b>{sharedTasks.filter(task => task.status !== "done").length}</b><small>open shared tasks</small></span>
        </div>
      </section>
      <section className="card span-4"><h2>Invite partner</h2><p className="muted">They use their own Compass login and control their own connected accounts.</p><InvitePartnerForm workspaceId={shared.id}/></section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Shared schedule</p><h2>Upcoming</h2></div><span className="pill" title="Upcoming events explicitly shared to Us">{sharedEvents.length}</span></div>
        <div className="shared-event-list">
          {sharedEvents.length ? sharedEvents.map(event => {
            const sourceId = sourceEventId(event);
            return sourceId
              ? <Link className="shared-event-row selectable-row" href={`/app/calendar?event=${sourceId}`} key={event.id}><SharedEventContent event={event}/></Link>
              : <article className="shared-event-row" key={event.id}><SharedEventContent event={event}/></article>;
          }) : <div className="empty-inline"><b>No shared events</b><p>Open an event in Calendar and choose Share to Us.</p><Link className="button secondary" href="/app/calendar">Open calendar</Link></div>}
        </div>
      </section>
      <section className="card span-6">
        <div className="section-heading"><div><p className="eyebrow">Shared tasks</p><h2>Household follow-ups</h2></div><span className="pill" title="Shared task count">{sharedTasks.length}</span></div>
        <TaskBoard workspaceId={shared.id} initialTasks={sharedTasks}/>
      </section>
    </div>
  );
}
