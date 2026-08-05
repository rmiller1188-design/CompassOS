import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type MessageResult = {
  id: string;
  subject: string | null;
  preview: string | null;
  sender: string | null;
  occurred_at: string;
};

type EventResult = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
};

type PersonResult = {
  id: string;
  display_name: string;
  email_addresses: string[];
  phone_numbers: string[];
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const admin = createAdminClient();
  let messages: MessageResult[] = [];
  let events: EventResult[] = [];
  let people: PersonResult[] = [];

  if (q.trim()) {
    const safeQuery = q.trim().replace(/[%_,().]/g, " ").replace(/\s+/g, " ");
    const pattern = `%${safeQuery}%`;
    const [messageQuery, eventQuery, peopleQuery] = await Promise.all([
      admin.from("communication_items").select("id,subject,preview,sender,occurred_at").eq("owner_id", user.id).or(`subject.ilike.${pattern},preview.ilike.${pattern},sender.ilike.${pattern}`).limit(30),
      admin.from("calendar_events").select("id,title,starts_at,location").eq("owner_id", user.id).or(`title.ilike.${pattern},location.ilike.${pattern}`).limit(30),
      admin.from("people").select("id,display_name,email_addresses,phone_numbers").eq("owner_id", user.id).ilike("display_name", pattern).limit(30)
    ]);
    messages = (messageQuery.data || []) as MessageResult[];
    events = (eventQuery.data || []) as EventResult[];
    people = (peopleQuery.data || []) as PersonResult[];
  }

  const total = messages.length + events.length + people.length;

  return (
    <div className="content-stack">
      <section className="card search-card">
        <form><input name="q" defaultValue={q} placeholder="Search imported messages, events, and people…"/><button className="button primary">Search</button></form>
      </section>
      {!q && (
        <section className="card">
          <div className="empty-inline">
            <b>Search activates after your first provider sync</b>
            <p>Compass searches imported email metadata, calendar events, and contacts. It does not search an account that has not been connected and synced.</p>
            <Link className="button primary" href="/app/settings/connections">Connect or sync an account</Link>
          </div>
        </section>
      )}
      {q && (
        <section className="card">
          <div className="section-heading"><h2>{total} results</h2><span className="pill">Private search</span></div>
          <div className="search-results">
            {messages.map(item => <Result key={`m-${item.id}`} icon="✉" title={item.subject || item.sender || "Message"} detail={item.preview || ""}/>)}
            {events.map(item => <Result key={`e-${item.id}`} icon="◫" title={item.title} detail={new Date(item.starts_at).toLocaleString()}/>)}
            {people.map(item => <Result key={`p-${item.id}`} icon="◎" title={item.display_name} detail={(item.email_addresses || []).join(", ")}/>)}
            {!total && <div className="empty-inline"><b>No matches</b><p>Try a person, subject, event, or phrase. Confirm that the account has completed a sync.</p></div>}
          </div>
        </section>
      )}
    </div>
  );
}

function Result({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return <article className="search-result"><span>{icon}</span><div><b>{title}</b><p>{detail}</p></div></article>;
}
