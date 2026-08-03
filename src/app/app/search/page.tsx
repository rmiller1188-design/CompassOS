import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const admin = createAdminClient();
  let messages: any[] = [], events: any[] = [], people: any[] = [];
  if (q.trim()) {
    const safeQuery = q.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ");
    const pattern = `%${safeQuery}%`;
    const [m,e,p] = await Promise.all([
      admin.from("communication_items").select("id,subject,preview,sender,occurred_at").eq("owner_id", user.id).or(`subject.ilike.${pattern},preview.ilike.${pattern},sender.ilike.${pattern}`).limit(30),
      admin.from("calendar_events").select("id,title,starts_at,location").eq("owner_id", user.id).or(`title.ilike.${pattern},location.ilike.${pattern}`).limit(30),
      admin.from("people").select("id,display_name,email_addresses,phone_numbers").eq("owner_id", user.id).ilike("display_name", pattern).limit(30)
    ]);
    messages=m.data||[];events=e.data||[];people=p.data||[];
  }
  const total=messages.length+events.length+people.length;
  return <div className="content-stack"><section className="card search-card"><form><input name="q" defaultValue={q} placeholder="Search messages, events, and people…"/><button className="button primary">Search</button></form></section>{q && <section className="card"><div className="section-heading"><h2>{total} results</h2><span className="pill">Private search</span></div><div className="search-results">{messages.map(x=><Result key={`m-${x.id}`} icon="✉" title={x.subject||x.sender||"Message"} detail={x.preview||""}/>)}{events.map(x=><Result key={`e-${x.id}`} icon="◫" title={x.title} detail={new Date(x.starts_at).toLocaleString()}/>)}{people.map(x=><Result key={`p-${x.id}`} icon="◎" title={x.display_name} detail={(x.email_addresses||[]).join(", ")}/>)}{!total&&<div className="empty-inline"><b>No matches</b><p>Try a person, subject, event, or phrase.</p></div>}</div></section>}</div>;
}
function Result({icon,title,detail}:{icon:string,title:string,detail:string}){return <article className="search-result"><span>{icon}</span><div><b>{title}</b><p>{detail}</p></div></article>}
