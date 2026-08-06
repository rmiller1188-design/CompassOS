import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessageFollowUpActions } from "@/components/message-follow-up-actions";
import { MessageUtilityActions } from "@/components/message-utility-actions";

export const dynamic = "force-dynamic";

type MessageListItem = {
  id: string;
  provider: string;
  channel: string;
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

type JoinedWorkspace = { id: string; kind: string };

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ message?: string | string[] }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const admin = createAdminClient();
  const [messageResult, membershipResult] = await Promise.all([
    admin
      .from("communication_items")
      .select("id,provider,channel,subject,sender,preview,occurred_at")
      .eq("owner_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    admin
      .from("workspace_members")
      .select("workspace_id,workspaces(id,kind)")
      .eq("user_id", user.id)
  ]);

  const items = (messageResult.data || []) as MessageListItem[];
  const hasSharedWorkspace = (membershipResult.data || []).some(row => {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    const workspaces = Array.isArray(joined) ? joined : joined ? [joined] : [];
    return workspaces.some(workspace => workspace.kind === "shared");
  });

  const requestedId = firstParam(params.message);
  const selectedId = requestedId || items[0]?.id || null;
  let selected: MessageDetail | null = null;

  if (selectedId) {
    const result = await admin
      .from("communication_items")
      .select("id,provider,channel,subject,sender,preview,occurred_at,recipients,body_text,thread_external_id,direction")
      .eq("owner_id", user.id)
      .eq("id", selectedId)
      .maybeSingle();
    selected = result.data as MessageDetail | null;
  }

  if (!selected && items[0]) {
    const fallback = await admin
      .from("communication_items")
      .select("id,provider,channel,subject,sender,preview,occurred_at,recipients,body_text,thread_external_id,direction")
      .eq("owner_id", user.id)
      .eq("id", items[0].id)
      .maybeSingle();
    selected = fallback.data as MessageDetail | null;
  }

  let thread: MessageDetail[] = selected ? [selected] : [];
  if (selected?.thread_external_id) {
    const result = await admin
      .from("communication_items")
      .select("id,provider,channel,subject,sender,preview,occurred_at,recipients,body_text,thread_external_id,direction")
      .eq("owner_id", user.id)
      .eq("provider", selected.provider)
      .eq("thread_external_id", selected.thread_external_id)
      .order("occurred_at", { ascending: true });
    thread = (result.data || [selected]) as MessageDetail[];
  }

  return (
    <div className="two-pane messages-two-pane">
      <section className="card list-pane">
        <div className="section-heading"><div><p className="eyebrow">Unified</p><h2>Messages</h2></div><span className="pill" title="Imported message count">{items.length}</span></div>
        <div className="message-list">
          {items.length ? items.map(item => {
            const active = selected?.id === item.id;
            return (
              <Link className={`message-row selectable-row${active ? " selected" : ""}`} href={`/app/messages?message=${item.id}`} key={item.id} aria-current={active ? "page" : undefined}>
                <span className={`provider-icon ${item.provider}`}>{item.provider === "google" ? "G" : item.provider === "microsoft" ? "M" : "↗"}</span>
                <div><b>{item.subject || item.sender || "Message"}</b><p>{item.preview || "No preview"}</p><small>{item.sender || item.channel} • {new Date(item.occurred_at).toLocaleString()}</small></div>
                <span className="row-chevron" aria-hidden="true">›</span>
              </Link>
            );
          }) : (
            <div className="empty-inline">
              <b>No imported messages yet</b>
              <p>Connect Google or Microsoft, approve read-only mail access, and run Sync now.</p>
              <Link className="button primary" href="/app/settings/connections">Connect or sync an account</Link>
            </div>
          )}
        </div>
      </section>
      <section className="card detail-pane">
        {selected ? (
          <div className="detail-stack">
            <div className="detail-header">
              <div>
                <p className="eyebrow">{selected.provider} · {selected.channel}</p>
                <h1>{selected.subject || "Message"}</h1>
              </div>
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
            <div className="detail-actions action-bar">
              <MessageFollowUpActions messageId={selected.id} hasSharedWorkspace={hasSharedWorkspace}/>
            </div>
            <MessageUtilityActions subject={selected.subject} sender={selected.sender} body={selected.body_text} preview={selected.preview}/>
          </div>
        ) : (
          <div className="empty-state compact"><span className="empty-icon">✉</span><h2>Select a message</h2><p>Choose a message from the list to open its imported details.</p></div>
        )}
      </section>
    </div>
  );
}
