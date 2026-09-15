import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvitePartnerForm } from "@/components/invite-partner-form";
import { CreateUsWorkspace } from "@/components/create-us-workspace";
import { TaskBoard } from "@/components/task-board";
import styles from "./us.module.css";

export const dynamic = "force-dynamic";

type SharedWorkspace = { id: string; name: string; kind: string; created_by: string };
type Membership = { role: string; workspaces: SharedWorkspace | SharedWorkspace[] | null };
type SharedEvent = { id: string; title: string; description: string | null; location: string | null; starts_at: string; ends_at: string; all_day: boolean };
type SharedTask = { id: string; title: string; notes: string | null; status: string; due_at: string | null; created_at: string };
type SharedFile = { id: string; file_name: string; content_type: string; size_bytes: number; created_at: string };
type Invitation = { id: string; email: string; expires_at: string; accepted_at: string | null; created_at: string };

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function UsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("workspace_members")
    .select("role,workspaces(id,name,kind,created_by)")
    .eq("user_id", user.id);

  const rows = (memberships || []) as Membership[];
  const availableWorkspaces = rows.flatMap(row => {
    const joined = row.workspaces;
    if (!joined) return [];
    return Array.isArray(joined) ? joined : [joined];
  });
  const shared = availableWorkspaces.find(workspace => workspace.kind === "shared");

  if (!shared) {
    return (
      <div className={styles.page}>
        <section className={`${styles.hero} card`}>
          <div className={styles.heroTop}>
            <div><p className="eyebrow">Us</p><h1>Create a deliberate shared space.</h1><p>Your partner gets their own Compass login and private connected accounts. Nothing from Gmail, Outlook, Calendar, People, Files, or AI memory becomes shared unless someone explicitly puts it in Us.</p></div>
          </div>
        </section>
        <div className={styles.setupGrid}>
          <section className={`${styles.setupCard} card`}><h2>Create the shared workspace</h2><p>Start the common space first. Shared tasks and explicitly shared calendar items will live here.</p><CreateUsWorkspace /></section>
          <section className={`${styles.setupCard} card`}><h2>Privacy boundary</h2><div className={styles.privacy}><Privacy icon="⌂" title="Private stays private" text="Connected mail, contacts, personal files, and private follow-ups remain in each person's own workspace."/><Privacy icon="↗" title="Sharing is explicit" text="Only actions such as Share to Us create a shared copy or shared task."/><Privacy icon="◎" title="Separate identities" text="Each person controls their own provider connections and authorization."/></div></section>
        </div>
      </div>
    );
  }

  const currentMembership = rows.find(row => {
    const workspaces = Array.isArray(row.workspaces) ? row.workspaces : row.workspaces ? [row.workspaces] : [];
    return workspaces.some(workspace => workspace.id === shared.id);
  });
  const canManage = new Set(["owner", "admin"]).has(currentMembership?.role || "");

  const [eventResult, taskResult, memberResult, fileResult, invitationResult] = await Promise.all([
    admin.from("calendar_events")
      .select("id,title,description,location,starts_at,ends_at,all_day")
      .eq("workspace_id", shared.id).eq("provider", "shared").gte("ends_at", new Date().toISOString()).order("starts_at").limit(30),
    admin.from("shared_tasks")
      .select("id,title,notes,status,due_at,created_at")
      .eq("workspace_id", shared.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(100),
    admin.from("workspace_members").select("user_id,role", { count: "exact" }).eq("workspace_id", shared.id),
    admin.from("file_entries").select("id,file_name,content_type,size_bytes,created_at").eq("workspace_id", shared.id).eq("visibility", "shared").order("created_at", { ascending: false }).limit(20),
    canManage
      ? admin.from("workspace_invitations").select("id,email,expires_at,accepted_at,created_at").eq("workspace_id", shared.id).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] })
  ]);

  const sharedEvents = (eventResult.data || []) as SharedEvent[];
  const sharedTasks = (taskResult.data || []) as SharedTask[];
  const sharedFiles = (fileResult.data || []) as SharedFile[];
  const invitations = (invitationResult.data || []) as Invitation[];
  const openTasks = sharedTasks.filter(task => task.status !== "done");
  const pendingInvites = invitations.filter(invitation => !invitation.accepted_at && new Date(invitation.expires_at).getTime() > Date.now());
  const memberCount = memberResult.count || 0;

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} card`}>
        <div className={styles.heroTop}>
          <div><p className="eyebrow">Us · Shared by consent</p><h1>{shared.name}</h1><p>A common operating space for things you deliberately choose to share. Private provider data stays outside this workspace.</p></div>
          <div className={styles.heroActions}><Link className="button secondary" href="/app/calendar">Calendar</Link><Link className="button secondary" href="/app/files">Private files</Link></div>
        </div>
        <div className={styles.metrics}>
          <Metric label="Members" value={String(memberCount)} note={`your role: ${currentMembership?.role || "member"}`}/>
          <Metric label="Schedule" value={String(sharedEvents.length)} note="upcoming shared events"/>
          <Metric label="Tasks" value={String(openTasks.length)} note="open shared follow-ups"/>
          <Metric label="Files" value={String(sharedFiles.length)} note="explicitly shared files"/>
        </div>
      </section>

      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Shared schedule</p><h2>Upcoming</h2><p>Only events explicitly copied into Us appear here. Shared copies do not link back into another member's private calendar.</p></div><span className="pill">{sharedEvents.length}</span></div>
            <div className={styles.eventList}>
              {sharedEvents.length ? sharedEvents.map(event => <article className={styles.event} key={event.id}><span className={styles.date}><b>{new Date(event.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b><small>{event.all_day ? "All day" : new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span><span className={styles.copy}><b>{event.title}</b><p>{event.location || "No location"}</p>{event.description && <small>{event.description}</small>}</span><span className="pill">shared</span></article>) : <div className={styles.empty}>No events have been shared into Us yet. Open Calendar and choose Share to Us.</div>}
            </div>
          </section>

          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Shared follow-ups</p><h2>Tasks</h2><p>Common commitments live here, separate from your private Mission Control tasks.</p></div><span className="pill">{sharedTasks.length}</span></div>
            <TaskBoard workspaceId={shared.id} initialTasks={sharedTasks}/>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">People</p><h2>{canManage ? "Invite partner" : "Shared membership"}</h2><p>{canManage ? "They sign in separately and authorize their own accounts." : "Only workspace owners and admins can create new invitations."}</p></div><span className="pill">{memberCount} members</span></div>
            {canManage ? <InvitePartnerForm workspaceId={shared.id}/> : <div className={styles.empty}>Your role is {currentMembership?.role || "member"}. Invitation controls remain with the workspace owner/admin.</div>}
            {canManage && pendingInvites.length > 0 && <div className={styles.inviteList}>{pendingInvites.slice(0, 5).map(invite => <div className={styles.invite} key={invite.id}><span className={styles.inviteIcon}>✉</span><span className={styles.copy}><b>{invite.email}</b><p>Invitation pending</p><small>Expires {new Date(invite.expires_at).toLocaleDateString()}</small></span><span className="pill">pending</span></div>)}</div>}
          </section>

          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Shared files</p><h2>Explicitly shared</h2><p>Private files do not enter this list automatically.</p></div><span className="pill">{sharedFiles.length}</span></div>
            <div className={styles.fileList}>
              {sharedFiles.length ? sharedFiles.slice(0, 8).map(file => <div className={styles.file} key={file.id}><span className={styles.fileIcon}>▣</span><span className={styles.copy}><b>{file.file_name}</b><p>{file.content_type}</p><small>{sizeLabel(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString()}</small></span><span className="pill">shared</span></div>) : <div className={styles.empty}>No files are explicitly shared to this workspace yet.</div>}
            </div>
          </section>

          <section className={`${styles.card} card`}>
            <div className={styles.header}><div><p className="eyebrow">Privacy boundary</p><h2>What Us means</h2></div></div>
            <div className={styles.privacy}><Privacy icon="✓" title="Deliberate sharing" text="Events, tasks, and files appear here only after an explicit share or creation action."/><Privacy icon="⊘" title="No implicit inbox sharing" text="Gmail, Outlook, contacts, and private AI context stay in the owner's personal workspace."/><Privacy icon="↔" title="Separate accounts" text="Each member manages their own Microsoft and Google authorization from Accounts."/></div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}

function Privacy({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className={styles.privacyRow}><span className={styles.privacyIcon}>{icon}</span><span><b>{title}</b><p>{text}</p></span></div>;
}
