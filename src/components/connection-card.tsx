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

export function ConnectionCard({ connection }: { connection: Connection }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const disconnected = connection.status === "disconnected";

  async function sync() {
    if (disconnected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sync/${connection.provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id })
      });
      const json = await response.json();
      const total = Object.values(json.counts || {}).reduce((sum: number, value) => sum + Number(value), 0);
      setMessage(response.ok ? `Synced ${total} items.` : json.error || "Sync failed");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="connection-card">
      <div className={`provider-icon ${connection.provider}`}>{connection.provider === "google" ? "G" : "M"}</div>
      <div className="connection-copy">
        <b>{connection.display_name || connection.account_email}</b>
        <p>{connection.account_email}</p>
        <small>{connection.scopes.length} granted scopes • {connection.last_sync_at ? `last synced ${new Date(connection.last_sync_at).toLocaleString()}` : "not synced yet"}</small>
        {connection.last_error && <small className="error-text">{connection.last_error}</small>}
        {disconnected && <small>Use the Connect button above to authorize this account again.</small>}
      </div>
      <span className={`status ${connection.status}`}>{connection.status}</span>
      <div className="connection-actions">
        <button className="button secondary" onClick={sync} disabled={busy || disconnected}>{disconnected ? "Reconnect above" : busy ? "Working…" : "Sync now"}</button>
        <button className="button danger" onClick={disconnect} disabled={busy || disconnected}>Disconnect</button>
      </div>
      {message && <p className="inline-message">{message}</p>}
    </article>
  );
}
