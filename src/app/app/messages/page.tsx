import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessageFollowUpActions } from "@/components/message-follow-up-actions";
import { MessageUtilityActions } from "@/components/message-utility-actions";

export const dynamic = "force-dynamic";

type SourceKey = "all" | "outlook" | "gmail" | "texts";

type MessageListItem = {
  id: string;
  provider: string;
  channel: string;
  connection_id: string | null;
  subject: string | null;
  sender: string | null;
  preview: string | null;
  occurred_at: string;
};

type MessageDetail = MessageListItem & {
  recipients: string[];
  body_text: string | null;
  thread_external_id: string | null;
  direction: string;
};

type Connection = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
};

type JoinedWorkspace = { id: string; kind: string };

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function sourceFromParam(value: string | null): SourceKey {
  return value === "outlook" || value === "gmail" || value === "texts" ? value : "all";
}

function belongsToSource(item: MessageListItem, source: SourceKey): boolean {
  if (source === "outlook") return item.provider === "microsoft" && item.channel === "email";
  if (source === "gmail") return item.provider === "google" && item.channel === "email";
  if (source === "texts") return item.channel === "sms";
  return true;
}

function sourceLabel(item: MessageListItem): string {
  if (item.channel === "sms") return "Texts";
  if (item.provider === "microsoft") return "Outlook";
  if (item.provider === "google") return "Gmail";
  return item.channel || "Message";
}

function sourceIcon(item: MessageListItem): string {
  if (item.channel === "sms") return "◉";
  if (item.provider === "microsoft") return "O";
  if (item.provider === "google") return "G";
  return "↗";
}

function buildMessagesHref(source: SourceKey, message?: string | null, account?: string | null): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (account) params.set("account", account);
  if (message) params.set("message", message);
  const query = params.toString();
  return query ? `/app/messages?${query}` : "/app/messages";
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const source = sourceFromParam(firstParam(params.source));
  const requestedAccount = firstParam(params.account);
  const requestedId = firstParam(params.message);
  const admin = createAdminClient();

  const [messageResult, connectionResult, membershipResult] = await Promise.all([
    admin
      .from("communication_items")
      .select("id,provider,channel,connection_id,subject,sender,preview,occurred_at")
      .eq("owner_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(250),
    admin
      .from("provider_connections")
      .select("id,provider,account_email,display_name,status,last_sync_at")
      .eq("owner_id", user.id)
      .order("provider")
      .order("account_email"),
    admin
      .from("workspace_members")
      .select("workspace_id,workspaces(id,kind)")
      .eq("user_id", user.id)
  ]);

  const allItems = (messageResult.data || []) as MessageListItem[];
  const connections = (connectionResult.data || []) as Connection[];
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));
  const hasSharedWorkspace = (membershipResult.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    const workspaces = Array.isArray(joined) ? joined : joined ? [joined] : [];
    return workspaces.some(workspace => workspace.kind === "shared");
  });

  const sourceConnections = source === "gmail"
    ? connections.filter(connection => connection.provider === "google")
    : source === "outlook"
      ? connections.filter(connection => connection.provider === "microsoft")
      : [];

  const validAccount = requestedAccount && sourceConnections.some(connection => connection.id === requestedAccount)
    ? requestedAccount
    : null;

  const sourceItems = allItems.filter(item => belongsToSource(item, source));
  const items = validAccount ? sourceItems.filter(item => item.connection_id === validAccount) : sourceItems;
  const visibleIds = new Set(items.map(item => item.id));
  const selectedId = requestedId && visibleIds.has(requestedId) ? requestedId : items[0]?.id || null;

  let selected: MessageDetail | null = null;
  if (selectedId) {
    const result = await admin
      .from("communication_items")
      .select("id,provider,channel,connection_id,subject,sender,preview,occurred_at,recipients,body_text,thread_external_id,direction")
      .eq("owner_id", user.id)
      .eq("id", selectedId)
      .maybeSingle();
    selected = result.data as MessageDetail | null;
  }

  let thread: MessageDetail[] = selected ? [selected] : [];
  if (selected?.thread_external_id) {
    let query = admin
      .from("communication_items")
      .select("id,provider,channel,connection_id,subject,sender,preview,occurred_at,recipients,body_text,thread_external_id,direction")
      .eq("owner_id", user.id)
      .eq("provider", selected.provider)
      .eq("thread_external_id", selected.thread_external_id);
    if (selected.connection_id) query = query.eq("connection_id", selected.connection_id);
    const result = await query.order("occurred_at", { ascending: true });
    thread = (result.data || [selected]) as MessageDetail[];
  }

  const counts = {
    all: allItems.length,
    outlook: allItems.filter(item => belongsToSource(item, "outlook")).length,
    gmail: allItems.filter(item => belongsToSource(item, "gmail")).length,
    texts: allItems.filter(item => belongsToSource(item, "texts")).length
  };

  const activeConnection = selected?.connection_id ? connectionById.get(selected.connection_id) || null : null;
  const textConnected = counts.texts > 0;

  return (
    <div className="communications-page">
      <section className="communications-header card">
        <div>
          <p className="eyebrow">Communications</p>
          <h1>Messages</h1>
          <p className="muted">Keep every inbox available without losing track of which account you are actually viewing.</p>
        </div>
        <Link className="button secondary" href="/app/settings/connections">Manage accounts</Link>
      </section>

      <nav className="source-switcher" aria-label="Message source">
        <SourceTab source="all" active={source} count={counts.all} label="All" icon="✦"/>
        <SourceTab source="outlook" active={source} count={counts.outlook} label="Outlook" icon="O"/>
        <SourceTab source="gmail" active={source} count={counts.gmail} label="Gmail" icon="G"/>
        <SourceTab source="texts" active={source} count={counts.texts} label="Texts" icon="◉" connected={textConnected}/>
      </nav>

      {(source === "gmail" || source === "outlook") && (
        <div className="account-strip card">
          <div className="account-strip-copy">
            <span className={`provider-icon ${source === "gmail" ? "google" : "microsoft"}`}>{source === "gmail" ? "G" : "O"}</span>
            <div><b>{source === "gmail" ? "Gmail accounts" : "Outlook accounts"}</b><small>Select one account or view all connected accounts.</small></div>
          </div>
          <div className="account-chips">
            <Link className={`account-chip${!validAccount ? " active" : ""}`} href={buildMessagesHref(source)}>All {source === "gmail" ? "Gmail" : "Outlook"}</Link>
            {sourceConnections.map(connection => (
              <Link className={`account-chip${validAccount === connection.id ? " active" : ""}`} href={buildMessagesHref(source, null, connection.id)} key={connection.id}>
                <span className={`health-dot ${connection.status}`}/>{connection.account_email}
              </Link>
            ))}
          </div>
        </div>
      )}

      {source === "texts" && !textConnected && (
        <div className="source-empty-banner card">
          <div className="source-empty-icon">◉</div>
          <div><b>Texts are intentionally separate</b><p>There is no SMS/iMessage ingestion source connected yet. When one is added, text conversations will live here instead of being mixed into email.</p></div>
        </div>
      )}

      <div className="two-pane messages-two-pane source-aware">
        <section className="card list-pane">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{source === "all" ? "All sources" : source === "outlook" ? "Microsoft" : source === "gmail" ? "Google" : "Messaging"}</p>
              <h2>{source === "outlook" ? "Outlook" : source === "gmail" ? "Gmail" : source === "texts" ? "Texts" : "All messages"}</h2>
              {validAccount && <small className="active-account-label">{connectionById.get(validAccount)?.account_email}</small>}
            </div>
            <span className="pill">{items.length}</span>
          </div>

          <div className="message-list">
            {items.length ? items.map(item => {
              const active = selected?.id === item.id;
              const connection = item.connection_id ? connectionById.get(item.connection_id) : null;
              return (
                <Link className={`message-row source-message-row selectable-row${active ? " selected" : ""}`} href={buildMessagesHref(source, item.id, validAccount)} key={item.id} aria-current={active ? "page" : undefined}>
                  <span className={`provider-icon ${item.channel === "sms" ? "texts" : item.provider}`}>{sourceIcon(item)}</span>
                  <div className="message-row-copy">
                    <div className="message-source-line"><span>{sourceLabel(item)}</span>{connection?.account_email && <small>{connection.account_email}</small>}</div>
                    <b>{item.subject || item.sender || "Message"}</b>
                    <p>{item.preview || "No preview"}</p>
                    <small>{item.sender || item.channel} • {new Date(item.occurred_at).toLocaleString()}</small>
                  </div>
                  <span className="row-chevron" aria-hidden="true">›</span>
                </Link>
              );
            }) : (
              <div className="empty-inline">
                <b>No {source === "outlook" ? "Outlook messages" : source === "gmail" ? "Gmail messages" : source === "texts" ? "texts" : "messages"} here yet</b>
                <p>{source === "texts" ? "Texts will appear only after a supported messaging source is connected." : "Run Sync now for the selected account, or manage connections."}</p>
                {source !== "texts" && <Link className="button primary" href="/app/settings/connections">Manage connections</Link>}
              </div>
            )}
          </div>
        </section>

        <section className="card detail-pane">
          {selected ? (
            <div className="detail-stack">
              <div className="message-context-banner">
                <span className={`provider-icon ${selected.channel === "sms" ? "texts" : selected.provider}`}>{sourceIcon(selected)}</span>
                <div><small>You are viewing</small><b>{sourceLabel(selected)}{activeConnection?.account_email ? ` · ${activeConnection.account_email}` : ""}</b></div>
                {activeConnection && <span className={`status ${activeConnection.status}`}>{activeConnection.status.replace("_", " ")}</span>}
              </div>

              <div className="detail-header">
                <div><p className="eyebrow">{sourceLabel(selected)} · {selected.channel}</p><h1>{selected.subject || "Message"}</h1></div>
                <span className="pill" title="Messages in this imported thread">{thread.length > 1 ? `${thread.length} messages` : "1 message"}</span>
              </div>
              <div className="detail-meta">
                <div><small>From</small><b>{selected.sender || "Unknown sender"}</b></div>
                <div><small>To</small><b>{selected.recipients?.length ? selected.recipients.join(", ") : "Not provided"}</b></div>
                <div><small>Received</small><b>{new Date(selected.occurred_at).toLocaleString()}</b></div>
              </div>
              <div className="thread-stack">
                {thread.map(message => (
                  <article className={`thread-message${message.id === selected.id ? " selected" : ""}`} key={message.id}>
                    <div className="thread-message-heading">
                      <div><b>{message.sender || "Unknown sender"}</b><small>{new Date(message.occurred_at).toLocaleString()}</small></div>
                      <span className="pill" title="Message direction">{message.direction}</span>
                    </div>
                    <div className="message-body">{message.body_text || message.preview || "No readable message content was imported."}</div>
                    {!message.body_text && <p className="detail-note">This item was synced before full-body import was enabled. Run Sync now again to refresh it.</p>}
                  </article>
                ))}
              </div>
              <div className="detail-actions action-bar"><MessageFollowUpActions messageId={selected.id} hasSharedWorkspace={hasSharedWorkspace}/></div>
              <MessageUtilityActions subject={selected.subject} sender={selected.sender} body={selected.body_text} preview={selected.preview}/>
            </div>
          ) : (
            <div className="empty-state compact"><span className="empty-icon">✉</span><h2>Select a message</h2><p>Choose a conversation from the selected source to open it.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

function SourceTab({ source, active, count, label, icon, connected = true }: { source: SourceKey; active: SourceKey; count: number; label: string; icon: string; connected?: boolean }) {
  return (
    <Link className={`source-tab ${source}${active === source ? " active" : ""}`} href={buildMessagesHref(source)} aria-current={active === source ? "page" : undefined}>
      <span className="source-tab-icon">{icon}</span>
      <span className="source-tab-copy"><b>{label}</b><small>{connected ? `${count} items` : "Not connected"}</small></span>
    </Link>
  );
}
