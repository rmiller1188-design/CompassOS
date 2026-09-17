import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContactActions } from "@/components/contact-actions";
import styles from "../people.module.css";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  provider: string;
  connection_id: string | null;
  display_name: string;
  email_addresses: string[];
  phone_numbers: string[];
  metadata: unknown;
  updated_at: string;
};
type Connection = { id: string; provider: "google" | "microsoft"; account_email: string; status: string; last_sync_at: string | null };
type Communication = {
  id: string;
  provider: string;
  channel: string;
  connection_id: string | null;
  sender: string | null;
  recipients: string[];
  subject: string | null;
  preview: string | null;
  occurred_at: string;
};
type Event = { id: string; provider: string; title: string; starts_at: string; attendees: unknown; location: string | null };

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

function providerLabel(provider: string): string {
  return provider === "microsoft" ? "Outlook" : provider === "google" ? "Google" : provider;
}

function messageHref(message: Communication): string {
  const source = message.channel === "sms" ? "texts" : message.provider === "microsoft" ? "outlook" : message.provider === "google" ? "gmail" : "all";
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (message.connection_id && (source === "outlook" || source === "gmail")) params.set("account", message.connection_id);
  params.set("message", message.id);
  return `/app/messages?${params.toString()}`;
}

function containsIdentity(value: string | null | undefined, needles: string[]): boolean {
  if (!value) return false;
  const lower = value.toLocaleLowerCase();
  return needles.some(needle => lower.includes(needle));
}

function recipientsContain(recipients: string[] | null | undefined, needles: string[]): boolean {
  return (recipients || []).some(recipient => containsIdentity(recipient, needles));
}

function attendeesContain(attendees: unknown, needles: string[]): boolean {
  if (!attendees) return false;
  try {
    const serialized = JSON.stringify(attendees).toLocaleLowerCase();
    return needles.some(needle => serialized.includes(needle));
  } catch {
    return false;
  }
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("people")
    .select("id,provider,connection_id,display_name,email_addresses,phone_numbers,metadata,updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();
  const person = data as Person;
  const needles = [...(person.email_addresses || []), ...(person.phone_numbers || [])]
    .map(value => value.trim().toLocaleLowerCase())
    .filter(Boolean);

  const [connectionResult, communicationResult, eventResult] = await Promise.all([
    person.connection_id
      ? admin.from("provider_connections").select("id,provider,account_email,status,last_sync_at").eq("id", person.connection_id).eq("owner_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("communication_items")
      .select("id,provider,channel,connection_id,sender,recipients,subject,preview,occurred_at")
      .eq("owner_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(500),
    admin.from("calendar_events")
      .select("id,provider,title,starts_at,attendees,location")
      .eq("owner_id", user.id)
      .order("starts_at", { ascending: false })
      .limit(300)
  ]);

  const connection = connectionResult.data as Connection | null;
  const communications = ((communicationResult.data || []) as Communication[]).filter(item =>
    needles.length > 0 && (containsIdentity(item.sender, needles) || recipientsContain(item.recipients, needles))
  );
  const events = ((eventResult.data || []) as Event[]).filter(event => needles.length > 0 && attendeesContain(event.attendees, needles));
  const recentActivity = [
    ...communications.slice(0, 12).map(item => ({
      kind: "message" as const,
      occurredAt: item.occurred_at,
      href: messageHref(item),
      icon: item.channel === "sms" ? "◉" : item.provider === "microsoft" ? "O" : item.provider === "google" ? "G" : "✉",
      title: item.subject || item.sender || "Communication",
      detail: `${item.channel === "sms" ? "Texts" : providerLabel(item.provider)} · ${item.preview || "No preview"}`
    })),
    ...events.slice(0, 8).map(event => ({
      kind: "event" as const,
      occurredAt: event.starts_at,
      href: `/app/calendar?event=${event.id}`,
      icon: "◷",
      title: event.title,
      detail: `${providerLabel(event.provider)} calendar${event.location ? ` · ${event.location}` : ""}`
    }))
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 15);
  const lastInteraction = recentActivity[0]?.occurredAt || null;
  const primaryEmail = person.email_addresses?.[0] || null;

  return (
    <div className={styles.page}>
      <section className={`${styles.detailHero} card`}>
        <Link className={styles.back} href="/app/people">← Back to People</Link>
        <div className={styles.identityRow}>
          <span className={styles.bigAvatar}>{initials(person.display_name)}</span>
          <div className={styles.identity}>
            <p className="eyebrow">Relationship</p>
            <h1>{person.display_name}</h1>
            <p>{providerLabel(person.provider)} contact{connection?.account_email ? ` · ${connection.account_email}` : ""}</p>
          </div>
          <span className={`status ${connection?.status || "healthy"}`}>{connection?.status?.replace("_", " ") || "synced"}</span>
        </div>
        <div className={styles.relationshipGrid}>
          <Metric label="Recent messages" value={String(communications.length)} />
          <Metric label="Meetings" value={String(events.length)} />
          <Metric label="Last interaction" value={lastInteraction ? new Date(lastInteraction).toLocaleDateString([], { month: "short", day: "numeric" }) : "None"} />
          <Metric label="Source" value={providerLabel(person.provider)} />
        </div>
        <ContactActions emails={person.email_addresses || []} phones={person.phone_numbers || []}/>
      </section>

      <div className={styles.detailGrid}>
        <section className={`${styles.card} card`}>
          <div className={styles.sectionHeader}><div><p className="eyebrow">Contact details</p><h2>Reach this person</h2><p>Imported details remain private to your Compass profile.</p></div></div>
          <div className={styles.contactList}>
            {(person.email_addresses || []).map(email => <div className={styles.contactItem} key={email}><small>Email</small><a href={`mailto:${email}`}>{email}</a></div>)}
            {(person.phone_numbers || []).map(phone => <div className={styles.contactItem} key={phone}><small>Phone</small><a href={`tel:${phone}`}>{phone}</a></div>)}
            <div className={styles.contactItem}><small>Provider account</small><b>{connection?.account_email || providerLabel(person.provider)}</b></div>
            <div className={styles.contactItem}><small>Contact record updated</small><b>{new Date(person.updated_at).toLocaleString()}</b></div>
          </div>
          <div className="button-row">
            {primaryEmail && <Link className="button secondary" href={`/app/search?q=${encodeURIComponent(primaryEmail)}&type=messages`}>Find all communications</Link>}
            <Link className="button secondary" href="/app/settings/connections">Sync contacts</Link>
          </div>
        </section>

        <section className={`${styles.card} card`}>
          <div className={styles.sectionHeader}><div><p className="eyebrow">Relationship timeline</p><h2>Recent context</h2><p>Communications and meetings that reference this contact's imported email or phone details.</p></div><span className="pill">{recentActivity.length}</span></div>
          <div className={styles.activityList}>
            {recentActivity.length ? recentActivity.map((item, index) => (
              <Link className={styles.activity} href={item.href} key={`${item.kind}-${item.occurredAt}-${index}`}>
                <span className={styles.activityIcon}>{item.icon}</span>
                <span className={styles.activityCopy}><b>{item.title}</b><p>{item.detail}</p></span>
                <span className={styles.activityTime}>{new Date(item.occurredAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              </Link>
            )) : <div className={styles.empty}>No related communications or meetings were found in the currently synced Compass data.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b></div>;
}
