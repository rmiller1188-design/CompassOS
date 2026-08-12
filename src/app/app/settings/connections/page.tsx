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
    case "google_access_denied":
      return "Google authorization was cancelled. No Google data was connected.";
    case "microsoft_access_denied":
      return "Microsoft authorization was cancelled. No Microsoft data was connected.";
    case "sign_in_required":
      return "Your Compass session expired during authorization. Sign in again, then reconnect.";
    case "microsoft_callback_state":
      return "Microsoft returned to CompassOS, but the OAuth state/PKCE session did not match. Diagnostic: CALLBACK_STATE.";
    case "microsoft_subject_mismatch":
      return "Microsoft returned successfully, but the CompassOS signed-in user changed during authorization. Diagnostic: SUBJECT_MISMATCH.";
    case "microsoft_profile_workspace":
      return "Microsoft authorization completed, but CompassOS could not resolve your personal workspace. Diagnostic: PROFILE_WORKSPACE.";
    case "microsoft_token_exchange_400":
      return "Microsoft accepted the sign-in but rejected CompassOS when exchanging the authorization code for tokens. This usually means the live client ID/client secret or redirect URI does not match the Entra app. Diagnostic: TOKEN_EXCHANGE_400.";
    case "microsoft_token_exchange_401":
      return "Microsoft rejected the CompassOS application credentials during token exchange. The live Microsoft client secret is invalid, expired, or belongs to a different app registration. Diagnostic: TOKEN_EXCHANGE_401.";
    case "microsoft_identity_401":
      return "Microsoft issued a token, but Graph rejected it when CompassOS requested your account identity. Diagnostic: IDENTITY_401.";
    case "microsoft_identity_403":
      return "Microsoft issued a token, but Graph permissions do not allow the required identity request. Diagnostic: IDENTITY_403.";
    case "microsoft_identity_invalid":
      return "Microsoft returned an identity response without a usable account ID/email. Diagnostic: IDENTITY_INVALID.";
    case "microsoft_connection_write":
      return "Microsoft authorization completed, but CompassOS could not save the connection. Diagnostic: CONNECTION_WRITE.";
    case "google_connection_failed":
      return "Google could not be connected. Confirm the Google OAuth redirect URI and credentials, then retry.";
    case "microsoft_connection_failed":
      return "Microsoft reached CompassOS but the connection did not complete. Diagnostic: MICROSOFT_CONNECTION_FAILED.";
    default:
      if (code?.startsWith("microsoft_token_exchange_")) return `Microsoft token exchange failed. Diagnostic: ${code.toUpperCase()}.`;
      if (code?.startsWith("microsoft_identity_")) return `Microsoft identity lookup failed. Diagnostic: ${code.toUpperCase()}.`;
      return code ? "The account connection did not complete. Check the OAuth configuration." : null;
  }
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

  return (
    <div className="settings-layout">
      <SettingsNav active="connections"/>
      <div className="content-stack">
        <section className="card page-intro">
          <p className="eyebrow">Private connections</p>
          <h1>Connect your accounts</h1>
          <p className="muted">Start read-only. Compass stores provider tokens only in an encrypted server-side vault. Your partner connects their own accounts from their own sign-in.</p>
          {profile && <ConnectAccountButtons profileId={profile.id}/>} 
        </section>
        {connected && <div className="notice success">{connected === "google" ? "Google" : connected === "microsoft" ? "Microsoft" : "Account"} connected. Run the first sync below.</div>}
        {errorMessage && <div className="notice error">{errorMessage}</div>}
        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">Account health</p><h2>{connectionRows.length} connected</h2></div></div>
          <div className="connection-list">{connectionRows.length ? connectionRows.map(connection => <ConnectionCard key={connection.id} connection={connection}/>) : <div className="empty-inline"><b>No connected accounts</b><p>Connect Google or Microsoft above. Read access is requested separately from Compass sign-in.</p></div>}</div>
        </section>
        <section className="card"><h2>What this build requests</h2><div className="permission-grid"><Permission title="Google" items={["Gmail read-only","Calendar read-only","Contacts read-only"]}/><Permission title="Microsoft" items={["Mail.Read","Calendars.Read","Contacts.Read"]}/><Permission title="Not requested" items={["Send email","Delete email","Write calendar","Passwords"]}/></div></section>
      </div>
    </div>
  );
}

function Permission({ title, items }: { title: string; items: string[] }) {
  return <div className="permission-card"><b>{title}</b><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></div>;
}
