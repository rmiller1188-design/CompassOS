import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContactActions } from "@/components/contact-actions";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  provider: string;
  display_name: string;
  email_addresses: string[];
  phone_numbers: string[];
  metadata: unknown;
  updated_at: string;
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("people")
    .select("id,provider,display_name,email_addresses,phone_numbers,metadata,updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();
  const person = data as Person;

  return (
    <div className="content-stack">
      <section className="card page-intro">
        <p className="eyebrow">Imported contact</p>
        <h1>{person.display_name}</h1>
        <p className="muted">This contact came from your {person.provider === "google" ? "Google" : "Microsoft"} account and remains private to your Compass profile.</p>
        <ContactActions emails={person.email_addresses || []} phones={person.phone_numbers || []}/>
      </section>
      <section className="card contact-detail-card">
        <div className="section-heading"><div><p className="eyebrow">Contact details</p><h2>Reach this person</h2></div><span className="pill">{person.provider}</span></div>
        <div className="contact-detail-grid">
          <div><small>Email addresses</small>{person.email_addresses?.length ? person.email_addresses.map(email => <a href={`mailto:${email}`} key={email}>{email}</a>) : <p>No email address imported.</p>}</div>
          <div><small>Phone numbers</small>{person.phone_numbers?.length ? person.phone_numbers.map(phone => <a href={`tel:${phone}`} key={phone}>{phone}</a>) : <p>No phone number imported.</p>}</div>
          <div><small>Last synced record update</small><b>{new Date(person.updated_at).toLocaleString()}</b></div>
        </div>
        <div className="button-row"><Link className="button secondary" href="/app/search">Back to search</Link><Link className="button secondary" href="/app/settings/connections">Sync contacts</Link></div>
      </section>
    </div>
  );
}
