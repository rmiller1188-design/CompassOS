import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConnectAccountButtons } from "@/components/connect-account-buttons";
import { ConnectionCard } from "@/components/connection-card";
import { SettingsNav } from "@/components/settings-nav";

export const dynamic = "force-dynamic";

type ConnectionRow = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string;
  display_name: string | null;
  status: string;
  scopes: string[];
  last_sync_at: string | null;
  last_error: string | null;
};

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function connectionErrorMessage(code: string | null): string | null {
  switch (code) {
    case "google_access_denied": return "Google authorization was cancelled. No Google data was connected.";
    case "microsoft_access_denied": return "Microsoft authorization was cancelled. No Microsoft data was connected.";
    case "sign_in_required": return "Your Compass session expired during authorization. Sign in again, then reconnect.";
    case "microsoft_callback_state": return "Microsoft returned to CompassOS, but the OAuth state/PKCE session did not match. Diagnostic: CALLBACK_STATE.";
    case "microsoft_subject_mismatch": return "Microsoft returned successfully, but the CompassOS signed-in user changed during authorization. Diagnostic: SUBJECT_MISMATCH.";
    case "microsoft_profile_workspace": return "Microsoft authorization completed, but CompassOS could not resolve your personal workspace. Diagnostic: PROFILE_WORKSPACE.";
    case "microsoft_token_exchange_400": return "Microsoft accepted the sign-in but rejected CompassOS when exchanging the authorization code for tokens. Diagnostic: TOKEN_EXCHANGE_400.";
    case "microsoft_token_exchange_401": return "Microsoft rejected the CompassOS application credentials during token exchange. Diagnostic: TOKEN_EXCHANGE_401.";
    case "microsoft_token_exchange_client_secret": return "Microsoft rejected the configured client secret. Diagnostic: TOKEN_EXCHANGE_CLIENT_SECRET.";
    case "microsoft_token_exchange_client_id": return "Microsoft rejected the configured application client ID. Diagnostic: TOKEN_EXCHANGE_CLIENT_ID.";
    case "microsoft_token_exchange_redirect_uri": return "Microsoft rejected the callback URI during token exchange. Diagnostic: TOKEN_EXCHANGE_REDIRECT_URI.";
    case "microsoft_identity_401": return "Microsoft issued a token, but Graph rejected it when CompassOS requested your account identity. Diagnostic: IDENTITY_401.";
    case "microsoft_identity_403": return "Microsoft issued a token, but Graph permissions do not allow the required identity request. Diagnostic: IDENTITY_403.";
    case "microsoft_identity_invalid": return "Microsoft returned an identity response without a usable account ID/email. Diagnostic: IDENTITY_INVALID.";
    case "microsoft_connection_write": return "Microsoft authorization completed, but CompassOS could not save the connection. Diagnostic: CONNECTION_WRITE.";
    case "google_connection_failed": return "Google could not be connected. Confirm the Google OAuth configuration, then retry.";
    case "microsoft_connection_failed": return "Microsoft reached CompassOS but the connection did not complete. Diagnostic: MICROSOFT_CONNECTION_FAILED.";
    default:
      if (code?.startsWith("microsoft_token_exchange_")) return `Microsoft token exchange failed. Diagnostic: ${code.toUpperCase()}.`;
      if (code?.startsWith("microsoft_identity_")) return `Microsoft identity lookup failed. Diagnostic: ${code.toUpperCase()}.`;
      return code ? "The account connection did not complete. Check the OAuth configuration." : null;
  }
}

function providerSource(provider: ConnectionRow["provider"]): "gmail" | "outlook" {
  return provider === "google" ? "gmail" : "outlook";
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const admin = createAdminClient();
  const params = await searchParams;
  const [{ data: profile }, { data: connections }] = await Promise.all([
    admin.from("profiles").select("id,display_name").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("provider_connections").select("id,provider,account_email,display_name,status,scopes,last_sync_at,last_error").eq("owner_id", user.id).order("created_at")
  ]);

  const connected = firstParam(params.connected);
  const errorMessage = connectionErrorMessage(firstParam(params.error));
  const connectionRows = (connections || []) as ConnectionRow[];
  const googleConnections = connectionRows.filter(connection => connection.provider === "google");
  const microsoftConnections = connectionRows.filter(connection => connection.provider === "microsoft");
  const healthyCount = connectionRows.filter(connection => connection.status === "healthy").length;
  const attentionCount = connectionRows.filter(connection => connection.status !== "healthy" && connection.status !== "syncing").length;

  return (
    <div className="settings-layout">
      <SettingsNav active="connections"/>
      <div className="content-stack accounts-control-center">
        <section className="card page-intro accounts-hero">
          <div>
            <p className="eyebrow">Account control center</p>
            <h1>Connected accounts</h1>
            <p className="muted">Accounts stay separate. CompassOS can aggregate them when useful, but Outlook and Gmail keep their own identity, inbox, health, and permissions.</p>
          </div>
          {profile && <ConnectAccountButtons profileId={profile.id}/>} 
        </section>

        {connected && <div className="notice success">{connected === "google" ? "Google" : connected === "microsoft" ? "Microsoft" : "Account"} connected. Run the first sync below.</div>}
        {errorMessage && <div className="notice error">{errorMessage}</div>}

        <section className="account-overview-grid">
          <OverviewCard label="Connected" value={connectionRows.length} note="Total provider identities"/>
          <OverviewCard label="Healthy" value={healthyCount} note="Ready to sync" tone="good"/>
          <OverviewCard label="Needs attention" value={attentionCount} note="Reauth or provider errors" tone={attentionCount ? "bad" : "neutral"}/>
        </section>

        <section className="provider-control-grid">
          <ProviderPanel provider="microsoft" title="Outlook" subtitle="Microsoft 365 / Outlook Mail" connections={microsoftConnections}/>
          <ProviderPanel provider="google" title="Gmail" subtitle="Google Mail" connections={googleConnections}/>
        </section>

        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">Detailed health</p><h2>{connectionRows.length} connected account{connectionRows.length === 1 ? "" : "s"}</h2></div></div>
          <div className="connection-list">{connectionRows.length ? connectionRows.map(connection => <ConnectionCard key={connection.id} connection={connection}/>) : <div className="empty-inline"><b>No connected accounts</b><p>Connect Google or Microsoft above. Read access is requested separately from Compass sign-in.</p></div>}</div>
        </section>

        <section className="card permissions-section">
          <div className="section-heading"><div><p className="eyebrow">Least privilege</p><h2>What CompassOS can access</h2></div></div>
          <div className="permission-grid"><Permission title="Gmail" items={["Gmail read-only","Calendar read-only","Contacts read-only"]}/><Permission title="Outlook" items={["Mail.Read","Calendars.Read","Contacts.Read"]}/><Permission title="Not requested" items={["Send email","Delete email","Write calendar","Passwords"]}/></div>
        </section>
      </div>
    </div>
  );
}

function OverviewCard({ label, value, note, tone = "neutral" }: { label: string; value: number; note: string; tone?: "neutral" | "good" | "bad" }) {
  return <div className={`card account-overview-card ${tone}`}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}

function ProviderPanel({ provider, title, subtitle, connections }: { provider: ConnectionRow["provider"]; title: string; subtitle: string; connections: ConnectionRow[] }) {
  const source = providerSource(provider);
  const healthy = connections.filter(connection => connection.status === "healthy").length;
  return (
    <article className={`card provider-control-card ${provider}`}>
      <div className="provider-control-heading">
        <span className={`provider-icon ${provider}`}>{provider === "google" ? "G" : "O"}</span>
        <div><p className="eyebrow">{provider === "google" ? "Google" : "Microsoft"}</p><h2>{title}</h2><small>{subtitle}</small></div>
        <span className={`status ${connections.length && healthy === connections.length ? "healthy" : connections.length ? "error" : ""}`}>{connections.length ? `${healthy}/${connections.length} healthy` : "Not connected"}</span>
      </div>
      <div className="provider-account-list">
        {connections.length ? connections.map(connection => (
          <div className="provider-account-row" key={connection.id}>
            <div><b>{connection.account_email}</b><small>{connection.display_name || "Connected account"}</small></div>
            <span className={`status ${connection.status}`}>{connection.status.replace("_", " ")}</span>
            <Link className="button secondary" href={`/app/messages?source=${source}&account=${connection.id}`}>Open inbox</Link>
          </div>
        )) : <div className="provider-empty"><b>No {title} account connected</b><span>Use the connect buttons above to add one.</span></div>}
      </div>
      {connections.length > 0 && <Link className="text-link provider-view-all" href={`/app/messages?source=${source}`}>View all {title} messages →</Link>}
    </article>
  );
}

function Permission({ title, items }: { title: string; items: string[] }) {
  return <div className="permission-card"><b>{title}</b><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></div>;
}
