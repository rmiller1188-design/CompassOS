import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: items } = await admin.from("communication_items").select("id,provider,channel,subject,sender,preview,occurred_at").eq("owner_id", user.id).order("occurred_at", { ascending: false }).limit(100);
  return <div className="two-pane"><section className="card list-pane"><div className="section-heading"><div><p className="eyebrow">Unified</p><h2>Messages</h2></div><span className="pill">{items?.length || 0}</span></div><div className="message-list">{items?.length ? items.map(item => <article className="message-row" key={item.id}><span className={`provider-icon ${item.provider}`}>{item.provider === "google" ? "G" : item.provider === "microsoft" ? "M" : "↗"}</span><div><b>{item.subject || item.sender || "Message"}</b><p>{item.preview || "No preview"}</p><small>{item.sender || item.channel} • {new Date(item.occurred_at).toLocaleString()}</small></div></article>) : <div className="empty-inline"><b>No imported messages yet</b><p>Connect an account and run Sync now.</p></div>}</div></section><section className="card detail-pane"><div className="empty-state compact"><span className="empty-icon">✉</span><h2>Conversation detail</h2><p>Selectable threads, AI summaries, drafts, and approval-before-send are the next implementation layer.</p></div></section></div>;
}
