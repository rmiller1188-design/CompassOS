import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./people.module.css";

export const dynamic = "force-dynamic";

type SourceKey = "all" | "outlook" | "google";
type Person = {
  id: string;
  provider: string;
  connection_id: string | null;
  display_name: string;
  email_addresses: string[];
  phone_numbers: string[];
  updated_at: string;
};
type Connection = { id: string; provider: "google" | "microsoft"; account_email: string; status: string };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function sourceFromParam(value: string): SourceKey {
  return value === "outlook" || value === "google" ? value : "all";
}

function sourceHref(source: SourceKey, q = ""): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/app/people?${query}` : "/app/people";
}

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Google" : provider;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const source = sourceFromParam(firstParam(params.source));
  const q = firstParam(params.q).trim();
  const admin = createAdminClient();

  const [{ data: peopleData }, { data: connectionData }] = await Promise.all([
    admin.from("people").select("id,provider,connection_id,display_name,email_addresses,phone_numbers,updated_at").eq("owner_id", user.id).order("display_name").limit(500),
    admin.from("provider_connections").select("id,provider,account_email,status").eq("owner_id", user.id)
  ]);

  const allPeople = (peopleData || []) as Person[];
  const connections = (connectionData || []) as Connection[];
  const connectionById = new Map(connections.map(connection => [connection.id, connection]));
  const sourcePeople = allPeople.filter(person => source === "all" || (source === "outlook" ? person.provider === "microsoft" : person.provider === "google"));
  const needle = q.toLocaleLowerCase();
  const people = q
    ? sourcePeople.filter(person => [person.display_name, ...(person.email_addresses || []), ...(person.phone_numbers || [])].some(value => value.toLocaleLowerCase().includes(needle)))
    : sourcePeople;
  const counts = {
    all: allPeople.length,
    outlook: allPeople.filter(person => person.provider === "microsoft").length,
    google: allPeople.filter(person => person.provider === "google").length
  };

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} card`}>
        <div>
          <p className="eyebrow">People</p>
          <h1>Your relationship directory.</h1>
          <p>Contacts stay tied to the account that supplied them so you can move from a person directly into the right Outlook or Gmail context.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className="button secondary" href="/app/search">Search everything</Link>
          <Link className="button secondary" href="/app/settings/connections">Sync contacts</Link>
        </div>
      </section>

      <nav className={styles.sourceBar} aria-label="People source">
        <SourceTab source="all" active={source} label="All people" icon="◎" count={counts.all}/>
        <SourceTab source="outlook" active={source} label="Outlook" icon="O" count={counts.outlook}/>
        <SourceTab source="google" active={source} label="Google" icon="G" count={counts.google}/>
      </nav>

      <section className={`${styles.searchCard} card`}>
        <form className={styles.searchForm}>
          {source !== "all" && <input type="hidden" name="source" value={source}/>} 
          <input name="q" defaultValue={q} placeholder="Find by name, email, or phone…" aria-label="Search people"/>
          <button className="button primary">Find person</button>
        </form>
      </section>

      {people.length ? (
        <section className={styles.grid}>
          {people.map(person => {
            const connection = person.connection_id ? connectionById.get(person.connection_id) : null;
            const primaryEmail = person.email_addresses?.[0] || null;
            const primaryPhone = person.phone_numbers?.[0] || null;
            return (
              <Link className={styles.person} href={`/app/people/${person.id}`} key={person.id}>
                <div className={styles.personTop}>
                  <span className={styles.avatar}>{initials(person.display_name)}</span>
                  <span className={styles.personCopy}>
                    <b>{person.display_name}</b>
                    <small>{primaryEmail || primaryPhone || "No contact detail imported"}</small>
                  </span>
                  <span className={styles.provider}>{providerLabel(person.provider)}</span>
                </div>
                {primaryEmail && <div className={styles.contactLine}>{primaryEmail}</div>}
                {primaryPhone && <div className={styles.contactLine}>{primaryPhone}</div>}
                <div className={styles.footer}><span>{connection?.account_email || "Connected provider"}</span><span>Open relationship →</span></div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="card"><div className={styles.empty}><b>{q ? `No people match “${q}”` : "No contacts in this source yet"}</b><p>Run a provider sync, or switch to another source.</p></div></section>
      )}
    </div>
  );
}

function SourceTab({ source, active, label, icon, count }: { source: SourceKey; active: SourceKey; label: string; icon: string; count: number }) {
  const tone = source === "google" ? styles.google : source === "outlook" ? styles.outlook : "";
  return <Link className={`${styles.source}${active === source ? ` ${styles.active}` : ""}`} href={sourceHref(source)} aria-current={active === source ? "page" : undefined}><span className={`${styles.sourceIcon}${tone ? ` ${tone}` : ""}`}>{icon}</span><span><b>{label}</b><small>{source === "all" ? "Private combined view" : "Provider contacts"}</small></span><span className={styles.count}>{count}</span></Link>;
}
