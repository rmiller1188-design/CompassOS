"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Connection = {
  id: string;
  provider: "google" | "microsoft";
  account_email: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  scopes: string[];
};

type SyncCounts = Record<string, number>;

function syncErrorMessage(code: string | undefined): string {
  switch (code) {
    case "sync_already_running":
      return "A sync is already running for this account.";
    case "provider_reauthorization_required":
      return "This account must be reconnected before it can sync again.";
    case "connection_not_found":
      return "This connection is no longer available.";
    case "provider_connection_mismatch":
      return "The selected provider does not match this connection.";
    case "google_calendar_scope_required":
      return "Google Calendar access is missing. Reconnect Google and approve the Calendar permission.";
    case "google_calendar_sync_failed":
      return "Messages synced, but Google Calendar could not finish. Review the Render logs for the calendar error.";
    default:
      return "Sync failed. Review the account status and server logs.";
  }
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function syncSummary(provider: Connection["provider"], counts: SyncCounts): string {
  const mail = count(counts.mail);
  const calendar = count(counts.calendar);
  const people = count(counts.people);
  if (provider === "google") {
    const calendars = count(counts.calendars);
    return `Synced ${mail} messages, ${calendar} events from ${calendars} calendars, and ${people} contacts.`;
  }
  return `Synced ${mail} messages, ${calendar} events, and ${people} contacts.`;
}

export function ConnectionCard({ connection }: { connection: Connection }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const disconnected = connection.status === "disconnected";
  const reauthRequired = connection.status === "reauth_required";

  async function sync() {
    if (disconnected || reauthRequired) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sync/${connection.provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(syncErrorMessage(json.error));
        return;
      }

      const counts: SyncCounts = { ...(json.counts || {}) };
      if (connection.provider === "google") {
        const calendarResponse = await fetch("/api/sync/google-calendar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ connectionId: connection.id })
        });
        const calendarJson = await calendarResponse.json();
        if (!calendarResponse.ok) {
          setMessage(syncErrorMessage(calendarJson.error));
          return;
        }
        counts.calendar = count(calendarJson.counts?.calendar);
        counts.calendars = count(calendarJson.counts?.calendars);
      }

      setMessage(syncSummary(connection.provider, counts));
      router.refresh();
    } catch {
      setMessage("Sync failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (disconnected) return;
    if (!window.confirm(`Disconnect ${connection.account_email}? Imported messages, events, and contacts will remain in Compass, but future sync stops until you reconnect.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Disconnect failed");
      setMessage("Disconnected. Imported data was preserved.");
      router.refresh();
    } catch {
      setMessage("Compass could not disconnect this account.");
    } finally {
      setBusy(false);
    }
  }

  const syncDisabled = busy || disconnected || reauthRequired;
  const syncLabel = disconnected || reauthRequired ? "Reconnect above" : busy ? "Working…" : "Sync now";

  return (
    <article className="connection-card">
      <div className={`provider-icon ${connection.provider}`}>{connection.provider === "google" ? "G" : "M"}</div>
      <div className="connection-copy">
        <b>{connection.display_name || connection.account_email}</b>
        <p>{connection.account_email}</p>
        <small>{connection.scopes.length} granted scopes • {connection.last_sync_at ? `last synced ${new Date(connection.last_sync_at).toLocaleString()}` : "not synced yet"}</small>
        {connection.last_error && <small className="error-text">{connection.last_error === "PROVIDER_REAUTH_REQUIRED" ? "Reauthorization required" : "The last sync did not complete"}</small>}
        {(disconnected || reauthRequired) && <small>Use the Connect button above to authorize this account again.</small>}
      </div>
      <span className={`status ${connection.status}`}>{connection.status.replaceAll("_", " ")}</span>
      <div className="connection-actions">
        <button className="button secondary" onClick={sync} disabled={syncDisabled}>{syncLabel}</button>
        <button className="button danger" onClick={disconnect} disabled={busy || disconnected}>Disconnect</button>
      </div>
      {message && <p className="inline-message">{message}</p>}
    </article>
  );
}
