import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DailyBrief } from "@/components/daily-brief";
import { TaskBoard } from "@/components/task-board";
import styles from "./mission-control.module.css";

export const dynamic = "force-dynamic";

type JoinedWorkspace = { id?: string; name?: string; kind?: string };
type Connection = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string;
  status: string;
  last_sync_at: string | null;
};
type HomeTask = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
};
type HomeMessage = {
  id: string;
  provider: string;
  channel: string;
  connection_id: string | null;
  subject: string | null;
  sender: string | null;
  preview: string | null;
  occurred_at: string;
};
type HomeEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  provider: string;
  location: string | null;
};
type AttentionItem = { label: string; note: string; href: string; kind: "connection" | "task" };

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Gmail" : provider;
}

function messageHref(message: HomeMessage): string {
  const source = message.channel === "sms" ? "texts" : message.provider === "microsoft" ? "outlook" : message.provider === "google" ? "gmail" : "all";
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (message.connection_id && (source === "outlook" || source === "gmail")) params.set("account", message.connection_id);
  params.set("message", message.id);
  return `/app/messages?${params.toString()}`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dueLabel(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id,display_name,personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single();
  if (!profile) return <SetupRequired />;

  const now = new Date();
  const nowIso = now.toISOString();
  const [
    connectionResult,
    messageResult,
    eventResult,
    taskResult,
    sharedWorkspaces,
    peopleResult,
    fileResult,
    gmailResult,
    outlookResult,
    textResult
  ] = await Promise.all([
    admin.from("provider_connections").select("id,provider,account_email,status,last_sync_at").eq("owner_id", user.id).order("provider").order("account_email"),
    admin.from("communication_items").select("id,provider,channel,connection_id,subject,sender,preview,occurred_at").eq("owner_id", user.id).eq("direction", "inbound").order("occurred_at", { ascending: false }).limit(7),
    admin.from("calendar_events").select("id,title,starts_at,ends_at,provider,location").eq("workspace_id", profile.personal_workspace_id).neq("provider", "shared").gte("starts_at", nowIso).order("starts_at").limit(5),
    admin.from("shared_tasks").select("id,title,notes,status,due_at,created_at").eq("workspace_id", profile.personal_workspace_id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(50),
    admin.from("workspace_members").select("workspace_id,workspaces(id,name,kind)").eq("user_id", user.id),
    admin.from("people").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("file_entries").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("provider", "google").eq("channel", "email"),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("provider", "microsoft").eq("channel", "email"),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("channel", "sms")
  ]);

  const connections = (connectionResult.data || []) as Connection[];
  const recentMessages = (messageResult.data || []) as HomeMessage[];
  const events = (eventResult.data || []) as HomeEvent[];
  const tasks = (taskResult.data || []) as HomeTask[];
  const healthyConnections = connections.filter(connection => connection.status === "healthy");
  const unhealthyConnections = connections.filter(connection => connection.status !== "healthy" && connection.status !== "syncing");
  const openTasks = tasks.filter(task => task.status !== "done");
  const overdueTasks = openTasks.filter(task => task.due_at && new Date(task.due_at).getTime() < now.getTime());
  const nextEvent = events[0] || null;
  const gmailCount = gmailResult.count || 0;
  const outlookCount = outlookResult.count || 0;
  const textCount = textResult.count || 0;
  const totalMessages = gmailCount + outlookCount + textCount;
  const peopleCount = peopleResult.count || 0;
  const fileCount = fileResult.count || 0;
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));
  const hasSharedWorkspace = (sharedWorkspaces.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    return Array.isArray(joined) ? joined.some(workspace => workspace?.kind === "shared") : joined?.kind === "shared";
  });

  const attention: AttentionItem[] = [
    ...unhealthyConnections.map(connection => ({
      label: `${providerLabel(connection.provider)} · ${connection.account_email}`,
      note: `Connection status: ${connection.status.replace("_", " ")}`,
      href: "/app/settings/connections",
      kind: "connection" as const
    })),
    ...overdueTasks.slice(0, 4).map(task => ({
      label: task.title,
      note: task.due_at ? `Follow-up overdue since ${dueLabel(task.due_at)}` : "Follow-up overdue",
      href: "/app#private-tasks",
      kind: "task" as const
    }))
  ].slice(0, 6);

  return (
    <div className={styles.missionControl}>
      {!connections.length && (
        <section className="notice">
          <b>Mission Control is waiting for a data source.</b> Connect Google or Microsoft and run the first sync to populate communications, calendar, and people.
        </section>
      )}

      <section className={`${styles.executiveHeader} card`}>
        <div className={styles.headerTop}>
          <div className={styles.headerCopy}>
            <p className="eyebrow">Mission Control</p>
            <h1>{profile.display_name ? `${profile.display_name}, here is your operating picture.` : "Your operating picture."}</h1>
            <p>One place for what needs attention, what is next, and which account or workspace it belongs to. Source identity stays visible instead of disappearing into a generic feed.</p>
          </div>
          <div className={styles.headerActions}>
            <Link className="button primary" href="/app/messages">Open communications</Link>
            <Link className="button secondary" href="/app/search">Search everything</Link>
          </div>
        </div>
        <div className={styles.pulseRow}>
          <PulseCard label="Accounts" value={`${healthyConnections.length}/${connections.length}`} note="healthy connections"/>
          <PulseCard label="Messages" value={String(totalMessages)} note="synced email + texts"/>
          <PulseCard label="Follow-ups" value={String(openTasks.length)} note={overdueTasks.length ? `${overdueTasks.length} overdue` : "none overdue"}/>
          <PulseCard label="Next" value={nextEvent ? new Date(nextEvent.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Clear"} note={nextEvent?.title || "no upcoming event"}/>
        </div>
      </section>

      <div className={styles.heroShell}>
        <div className={styles.briefWrap}><DailyBrief workspaceId={profile.personal_workspace_id}/></div>
        <div className={styles.statusRail}>
          <section className={`${styles.statusCard} card`}>
            <div className={styles.statusHeading}><h2>Account health</h2><Link className="text-link" href="/app/settings/connections">Manage</Link></div>
            <div className={styles.healthList}>
              {connections.length ? connections.map(connection => (
                <Link href={`/app/messages?source=${connection.provider === "google" ? "gmail" : "outlook"}&account=${connection.id}`} className={styles.healthRow} key={connection.id}>
                  <span className={`${styles.healthIcon} ${connection.provider === "google" ? styles.google : styles.microsoft}`}>{connection.provider === "google" ? "G" : "O"}</span>
                  <span className={styles.healthCopy}><b>{connection.account_email}</b><small>{providerLabel(connection.provider)}{connection.last_sync_at ? ` · synced ${shortDate(connection.last_sync_at)}` : " · not synced yet"}</small></span>
                  <span className={`status ${connection.status}`}>{connection.status.replace("_", " ")}</span>
                </Link>
              )) : <div className={styles.emptyCompact}>No connected accounts.</div>}
            </div>
          </section>
          <section className={`${styles.statusCard} card`}>
            <div className={styles.statusHeading}><h2>System pulse</h2><span className="pill">Live data</span></div>
            <div className={`${styles.systemNotice}${attention.length ? ` ${styles.bad}` : ""}`}>
              {attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"} need attention across connections and follow-ups.` : "No connection failures or overdue follow-ups detected."}
            </div>
          </section>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.stack}>
          <section className={`${styles.sectionCard} card`}>
            <div className={styles.sectionHeader}><div><p className="eyebrow">Communications</p><h2>Choose the source you mean</h2><p>Outlook, Gmail, and Texts remain distinct. All is available only when you want aggregation.</p></div><Link className="text-link" href="/app/messages">Open all →</Link></div>
            <div className={styles.sourceGrid}>
              <SourceCard label="Outlook" provider="outlook" icon="O" count={outlookCount} accounts={connections.filter(connection => connection.provider === "microsoft").length}/>
              <SourceCard label="Gmail" provider="gmail" icon="G" count={gmailCount} accounts={connections.filter(connection => connection.provider === "google").length}/>
              <SourceCard label="Texts" provider="texts" icon="◉" count={textCount} accounts={textCount ? 1 : 0}/>
              <Link className={styles.sourceCard} href="/app/messages">
                <div className={styles.sourceTop}><span className={styles.sourceIcon}>✦</span><span><b>All communications</b><small>Aggregated only when requested</small></span></div>
                <div className={styles.sourceMetric}>{totalMessages}</div><div className={styles.sourceFoot}><span>all synced items</span><span>Open →</span></div>
              </Link>
            </div>
          </section>

          <section className={`${styles.sectionCard} card`}>
            <div className={styles.sectionHeader}><div><p className="eyebrow">Recent inbound</p><h2>Latest communications</h2><p>Every item preserves its provider and account identity.</p></div></div>
            <div className={styles.messagePreviewList}>
              {recentMessages.length ? recentMessages.map(message => {
                const connection = message.connection_id ? connectionById.get(message.connection_id) : null;
                const label = message.channel === "sms" ? "Texts" : providerLabel(message.provider);
                return (
                  <Link className={styles.messagePreview} href={messageHref(message)} key={message.id}>
                    <span className={styles.messagePreviewIcon}>{message.channel === "sms" ? "◉" : message.provider === "microsoft" ? "O" : message.provider === "google" ? "G" : "↗"}</span>
                    <span className={styles.messagePreviewCopy}><b>{message.subject || message.sender || "Message"}</b><small>{label}{connection?.account_email ? ` · ${connection.account_email}` : ""} · {shortDate(message.occurred_at)}</small><p>{message.preview || "No preview available"}</p></span>
                  </Link>
                );
              }) : <div className={styles.emptyCompact}>No inbound communications have been synced yet.</div>}
            </div>
          </section>

          <section className={`${styles.sectionCard} card`} id="private-tasks">
            <div className={styles.sectionHeader}><div><p className="eyebrow">Follow-ups</p><h2>Private task board</h2><p>{openTasks.length} open{overdueTasks.length ? ` · ${overdueTasks.length} overdue` : ""}</p></div></div>
            <div className={styles.taskWrap}><TaskBoard workspaceId={profile.personal_workspace_id} initialTasks={tasks} compact/></div>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={`${styles.sectionCard} card`}>
            <div className={styles.sectionHeader}><div><p className="eyebrow">Needs attention</p><h2>Exceptions first</h2><p>Connection issues and overdue commitments rise above routine activity.</p></div></div>
            <div className={styles.attentionList}>
              {attention.length ? attention.map((item, index) => (
                <Link className={styles.attentionItem} href={item.href} key={`${item.kind}-${index}-${item.label}`}>
                  <span className={`${styles.attentionIcon} ${styles.bad}`}>{item.kind === "connection" ? "!" : "↗"}</span>
                  <span><b>{item.label}</b><small>{item.note}</small></span><span className={styles.timeBadge}>Review</span>
                </Link>
              )) : <div className={styles.emptyCompact}>No blockers detected. Mission Control is clear.</div>}
            </div>
          </section>

          <section className={`${styles.sectionCard} card`}>
            <div className={styles.sectionHeader}><div><p className="eyebrow">Calendar</p><h2>What is next</h2><p>Upcoming events from your private connected calendars.</p></div><Link className="text-link" href="/app/calendar">Calendar →</Link></div>
            <div className={styles.timelineList}>
              {events.length ? events.map(event => (
                <Link className={styles.timelineItem} href={`/app/calendar?event=${event.id}`} key={event.id}>
                  <span className={styles.timelineIcon}>◷</span><span><b>{event.title}</b><small>{providerLabel(event.provider)}{event.location ? ` · ${event.location}` : ""}</small></span><span className={styles.timeBadge}>{shortDate(event.starts_at)}</span>
                </Link>
              )) : <div className={styles.emptyCompact}>No upcoming events.</div>}
            </div>
          </section>

          <section className={`${styles.sectionCard} card`}>
            <div className={styles.sectionHeader}><div><p className="eyebrow">Launchpad</p><h2>Go directly to the work</h2></div></div>
            <div className={styles.quickGrid}>
              <QuickAction href="/app/search" icon="⌕" label="Search" note="Across Compass"/>
              <QuickAction href="/app/calendar" icon="◷" label="Calendar" note={`${events.length} upcoming loaded`}/>
              <QuickAction href="/app/people" icon="◎" label="People" note={`${peopleCount} synced`}/>
              <QuickAction href="/app/files" icon="▣" label="Files" note={`${fileCount} stored`}/>
              <QuickAction href="/app/us" icon="♡" label="Us" note={hasSharedWorkspace ? "Shared space active" : "Set up shared space"}/>
              <QuickAction href="/app/settings/connections" icon="⚙" label="Accounts" note={`${connections.length} connected`}/>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PulseCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.pulseCard}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}

function SourceCard({ label, provider, icon, count, accounts }: { label: string; provider: "outlook" | "gmail" | "texts"; icon: string; count: number; accounts: number }) {
  return (
    <Link className={styles.sourceCard} href={`/app/messages?source=${provider}`}>
      <div className={styles.sourceTop}><span className={`${styles.sourceIcon} ${styles[provider]}`}>{icon}</span><span><b>{label}</b><small>{accounts ? `${accounts} source${accounts === 1 ? "" : "s"}` : "Not connected"}</small></span></div>
      <div className={styles.sourceMetric}>{count}</div><div className={styles.sourceFoot}><span>synced items</span><span>Open →</span></div>
    </Link>
  );
}

function QuickAction({ href, icon, label, note }: { href: string; icon: string; label: string; note: string }) {
  return <Link className={styles.quickAction} href={href}><span>{icon}</span>{label}<small>{note}</small></Link>;
}

function SetupRequired() {
  return <section className="card empty-state"><h1>Finish database setup</h1><p>Run the M26 Supabase migrations, then sign out and sign back in. Compass will create your private profile and personal workspace automatically.</p><Link className="button primary" href="/app/settings/connections">Open setup</Link></section>;
}
