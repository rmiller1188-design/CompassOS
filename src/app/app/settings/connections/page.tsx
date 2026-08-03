import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConnectAccountButtons } from "@/components/connect-account-buttons";
import { ConnectionCard } from "@/components/connection-card";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const [{ data: profile }, { data: connections }] = await Promise.all([
    admin.from("profiles").select("id,display_name").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("provider_connections").select("id,provider,account_email,display_name,status,scopes,last_sync_at,last_error").eq("owner_id", user.id).order("created_at")
  ]);

  return (
    <div className="content-stack">
      <section className="card page-intro"><p className="eyebrow">Private connections</p><h1>Connect your accounts</h1><p className="muted">Start read-only. Compass stores provider tokens only in an encrypted server-side vault. Your partner connects their own accounts from their own sign-in.</p>{profile && <ConnectAccountButtons profileId={profile.id}/>}</section>
      {params.connected && <div className="notice success">{String(params.connected)} connected. Run the first sync below.</div>}
      {params.error && <div className="notice error">{String(params.error)}</div>}
      <section className="card"><div className="section-heading"><div><p className="eyebrow">Account health</p><h2>{connections?.length || 0} connected</h2></div></div><div className="connection-list">{connections?.length ? connections.map((connection: any) => <ConnectionCard key={connection.id} connection={connection}/>) : <div className="empty-inline"><b>No connected accounts</b><p>Connect Google or Microsoft above. Read access is requested separately from Compass sign-in.</p></div>}</div></section>
      <section className="card"><h2>What this build requests</h2><div className="permission-grid"><Permission title="Google" items={["Gmail read-only","Calendar read-only","Contacts read-only"]}/><Permission title="Microsoft" items={["Mail.Read","Calendars.Read","Contacts.Read"]}/><Permission title="Not requested" items={["Send email","Delete email","Write calendar","Passwords"]}/></div></section>
    </div>
  );
}

function Permission({ title, items }: { title: string; items: string[] }) {
  return <div className="permission-card"><b>{title}</b><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></div>;
}
