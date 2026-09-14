import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

type SearchKind = "all" | "messages" | "calendar" | "people" | "files" | "tasks";
type Connection = { id: string; provider: "google" | "microsoft"; account_email: string };
type MessageResult = {
  id: string;
  provider: string;
  channel: string;
  connection_id: string | null;
  subject: string | null;
  preview: string | null;
  sender: string | null;
  occurred_at: string;
};
type EventResult = { id: string; title: string; starts_at: string; location: string | null; provider: string };
type PersonResult = { id: string; display_name: string; email_addresses: string[]; phone_numbers: string[] };
type FileResult = { id: string; file_name: string; content_type: string; size_bytes: number; created_at: string };
type TaskResult = { id: string; title: string; notes: string | null; status: string; due_at: string | null };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function searchKind(value: string): SearchKind {
  return value === "messages" || value === "calendar" || value === "people" || value === "files" || value === "tasks" ? value : "all";
}

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Gmail" : provider;
}

function messageHref(item: MessageResult): string {
  const source = item.channel === "sms" ? "texts" : item.provider === "microsoft" ? "outlook" : item.provider === "google" ? "gmail" : "all";
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (item.connection_id && (source === "outlook" || source === "gmail")) params.set("account", item.connection_id);
  params.set("message", item.id);
  return `/app/messages?${params.toString()}`;
}

function filterHref(q: string, kind: SearchKind): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind !== "all") params.set("type", kind);
  const query = params.toString();
  return query ? `/app/search?${query}` : "/app/search";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = firstParam(params.q).trim();
  const activeType = searchKind(firstParam(params.type));
  const admin = createAdminClient();

  const [{ data: profile }, { data: connections }, messageTotal, eventTotal, peopleTotal, fileTotal] = await Promise.all([
    admin.from("profiles").select("personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("provider_connections").select("id,provider,account_email").eq("owner_id", user.id),
    admin.from("communication_items").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("calendar_events").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("people").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
    admin.from("file_entries").select("id", { count: "exact", head: true }).eq("owner_id", user.id)
  ]);

  const taskTotal = profile?.personal_workspace_id
    ? await admin.from("shared_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", profile.personal_workspace_id).neq("status", "cancelled")
    : { count: 0 };

  let messages: MessageResult[] = [];
  let events: EventResult[] = [];
  let people: PersonResult[] = [];
  let files: FileResult[] = [];
  let tasks: TaskResult[] = [];

  const normalized = q.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized) {
    const pattern = `%${normalized}%`;
    const [messageQuery, eventQuery, peopleQuery, fileQuery, taskQuery] = await Promise.all([
      admin.from("communication_items")
        .select("id,provider,channel,connection_id,subject,preview,sender,occurred_at")
        .eq("owner_id", user.id)
        .or(`subject.ilike.${pattern},preview.ilike.${pattern},sender.ilike.${pattern},body_text.ilike.${pattern}`)
        .order("occurred_at", { ascending: false })
        .limit(40),
      admin.from("calendar_events")
        .select("id,title,starts_at,location,provider")
        .eq("owner_id", user.id)
        .or(`title.ilike.${pattern},location.ilike.${pattern},description.ilike.${pattern}`)
        .order("starts_at", { ascending: false })
        .limit(40),
      admin.from("people")
        .select("id,display_name,email_addresses,phone_numbers")
        .eq("owner_id", user.id)
        .order("display_name")
        .limit(250),
      admin.from("file_entries")
        .select("id,file_name,content_type,size_bytes,created_at")
        .eq("owner_id", user.id)
        .ilike("file_name", pattern)
        .order("created_at", { ascending: false })
        .limit(40),
      profile?.personal_workspace_id
        ? admin.from("shared_tasks")
            .select("id,title,notes,status,due_at")
            .eq("workspace_id", profile.personal_workspace_id)
            .neq("status", "cancelled")
            .or(`title.ilike.${pattern},notes.ilike.${pattern}`)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] })
    ]);

    messages = (messageQuery.data || []) as MessageResult[];
    events = (eventQuery.data || []) as EventResult[];
    const needle = normalized.toLocaleLowerCase();
    people = ((peopleQuery.data || []) as PersonResult[]).filter(person => {
      const values = [person.display_name, ...(person.email_addresses || []), ...(person.phone_numbers || [])];
      return values.some(value => value.toLocaleLowerCase().includes(needle));
    }).slice(0, 40);
    files = (fileQuery.data || []) as FileResult[];
    tasks = ((taskQuery as { data?: unknown[] | null }).data || []) as TaskResult[];
  }

  const connectionById = new Map(((connections || []) as Connection[]).map(connection => [connection.id, connection]));
  const counts = { messages: messages.length, calendar: events.length, people: people.length, files: files.length, tasks: tasks.length };
  const totalMatches = counts.messages + counts.calendar + counts.people + counts.files + counts.tasks;
  const show = (kind: Exclude<SearchKind, "all">) => activeType === "all" || activeType === kind;

  return (
    <div className={styles.searchPage}>
      <section className={`${styles.hero} card`}>
        <p className="eyebrow">Compass Search</p>
        <h1>Find anything you have connected.</h1>
        <p>Search synced communications, calendar events, people, private files, and follow-ups without losing the source account or workspace context.</p>
        <form className={styles.searchForm}>
          <input name="q" defaultValue={q} placeholder="Search a person, project, subject, phrase, file, or follow-up…" aria-label="Search Compass" autoFocus/>
          {activeType !== "all" && <input type="hidden" name="type" value={activeType}/>} 
          <button className="button primary">Search Compass</button>
        </form>
      </section>

      <nav className={styles.filterBar} aria-label="Search result type">
        <FilterChip label="All" kind="all" active={activeType} q={q} count={totalMatches}/>
        <FilterChip label="Communications" kind="messages" active={activeType} q={q} count={counts.messages}/>
        <FilterChip label="Calendar" kind="calendar" active={activeType} q={q} count={counts.calendar}/>
        <FilterChip label="People" kind="people" active={activeType} q={q} count={counts.people}/>
        <FilterChip label="Files" kind="files" active={activeType} q={q} count={counts.files}/>
        <FilterChip label="Tasks" kind="tasks" active={activeType} q={q} count={counts.tasks}/>
      </nav>

      {!q && (
        <section className="card">
          <div className={styles.empty}>
            <b>Your private index is ready to query.</b>
            <p>Search is scoped to data already synced or stored inside your Compass profile. It does not silently query disconnected accounts.</p>
            <div className={styles.launchGrid}>
              <Launch href="/app/messages" icon="✉" label="Communications" note={`${messageTotal.count || 0} indexed`}/>
              <Launch href="/app/calendar" icon="◷" label="Calendar" note={`${eventTotal.count || 0} events`}/>
              <Launch href="/app/people" icon="◎" label="People" note={`${peopleTotal.count || 0} contacts`}/>
              <Launch href="/app/files" icon="▣" label="Files" note={`${fileTotal.count || 0} files`}/>
              <Launch href="/app#private-tasks" icon="✓" label="Tasks" note={`${taskTotal.count || 0} follow-ups`}/>
            </div>
          </div>
        </section>
      )}

      {q && (
        <>
          <section className={styles.summaryGrid} aria-label="Search result summary">
            <Summary label="Messages" value={counts.messages} note="email + texts"/>
            <Summary label="Calendar" value={counts.calendar} note="events"/>
            <Summary label="People" value={counts.people} note="contacts"/>
            <Summary label="Files" value={counts.files} note="private storage"/>
            <Summary label="Tasks" value={counts.tasks} note="follow-ups"/>
          </section>

          <div className={styles.resultsShell}>
            {show("messages") && <ResultGroup title="Communications" note="Source and account identity preserved" count={counts.messages}>
              {messages.map(item => {
                const connection = item.connection_id ? connectionById.get(item.connection_id) : null;
                const source = item.channel === "sms" ? "Texts" : providerLabel(item.provider);
                const tone = item.channel === "sms" ? "texts" : item.provider === "microsoft" ? "outlook" : item.provider === "google" ? "gmail" : "";
                return <SearchResult key={`m-${item.id}`} href={messageHref(item)} icon={item.channel === "sms" ? "◉" : item.provider === "microsoft" ? "O" : item.provider === "google" ? "G" : "✉"} tone={tone} kind={source} title={item.subject || item.sender || "Message"} detail={item.preview || "No preview"} meta={`${connection?.account_email ? `${connection.account_email} · ` : ""}${new Date(item.occurred_at).toLocaleString()}`}/>;
              })}
            </ResultGroup>}

            {show("calendar") && <ResultGroup title="Calendar" note="Synced private events" count={counts.calendar}>
              {events.map(item => <SearchResult key={`e-${item.id}`} href={`/app/calendar?event=${item.id}`} icon="◷" kind={providerLabel(item.provider)} title={item.title} detail={item.location || "No location"} meta={new Date(item.starts_at).toLocaleString()}/>) }
            </ResultGroup>}

            {show("people") && <ResultGroup title="People" note="Names, emails, and phone numbers" count={counts.people}>
              {people.map(item => <SearchResult key={`p-${item.id}`} href={`/app/people/${item.id}`} icon="◎" kind="Contact" title={item.display_name} detail={(item.email_addresses || []).join(", ") || (item.phone_numbers || []).join(", ") || "Open contact"} meta={(item.phone_numbers || [])[0] || "Synced person"}/>) }
            </ResultGroup>}

            {show("files") && <ResultGroup title="Files" note="Private cloud storage" count={counts.files}>
              {files.map(item => <SearchResult key={`f-${item.id}`} href="/app/files" icon="▣" kind="File" title={item.file_name} detail={item.content_type} meta={`${formatBytes(item.size_bytes)} · ${new Date(item.created_at).toLocaleDateString()}`}/>) }
            </ResultGroup>}

            {show("tasks") && <ResultGroup title="Tasks & follow-ups" note="Private workspace commitments" count={counts.tasks}>
              {tasks.map(item => <SearchResult key={`t-${item.id}`} href="/app#private-tasks" icon="✓" kind={item.status.replace("_", " ")} title={item.title} detail={item.notes || "No notes"} meta={item.due_at ? `Due ${new Date(item.due_at).toLocaleString()}` : "No due date"}/>) }
            </ResultGroup>}

            {!totalMatches && <section className="card"><div className={styles.empty}><b>No matches for “{q}”</b><p>Try a person, account email, message phrase, event, filename, or follow-up. Confirm the relevant provider has completed a sync.</p></div></section>}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, kind, active, q, count }: { label: string; kind: SearchKind; active: SearchKind; q: string; count: number }) {
  return <Link className={`${styles.filterChip}${active === kind ? ` ${styles.active}` : ""}`} href={filterHref(q, kind)} aria-current={active === kind ? "page" : undefined}>{label}<span>{count}</span></Link>;
}

function Summary({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className={styles.summaryCard}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}

function ResultGroup({ title, note, count, children }: { title: string; note: string; count: number; children: React.ReactNode }) {
  return <section className={`${styles.resultGroup} card`}><div className={styles.groupHeader}><div><h2>{title}</h2><p>{note}</p></div><span className="pill">{count}</span></div><div className={styles.results}>{count ? children : <div className={styles.empty}><b>No matches in {title.toLowerCase()}</b></div>}</div></section>;
}

function SearchResult({ href, icon, tone = "", kind, title, detail, meta }: { href: string; icon: string; tone?: string; kind: string; title: string; detail: string; meta: string }) {
  const toneClass = tone === "gmail" ? styles.gmail : tone === "outlook" ? styles.outlook : tone === "texts" ? styles.texts : "";
  return <Link className={styles.result} href={href}><span className={`${styles.icon}${toneClass ? ` ${toneClass}` : ""}`}>{icon}</span><span className={styles.copy}><b>{title}</b><p>{detail}</p><span className={styles.meta}><span className={styles.kind}>{kind}</span><span>{meta}</span></span></span><span className={styles.chevron}>›</span></Link>;
}

function Launch({ href, icon, label, note }: { href: string; icon: string; label: string; note: string }) {
  return <Link className={styles.launch} href={href}><span>{icon}</span><strong>{label}</strong><small>{note}</small></Link>;
}
