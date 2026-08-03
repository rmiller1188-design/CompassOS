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

  async function sync() {
    setBusy(true); setMessage("");
    const response = await fetch(`/api/sync/${connection.provider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id })
    });
    const json = await response.json();
    setMessage(response.ok ? `Synced ${Object.values(json.counts || {}).reduce((a: number, b) => a + Number(b), 0)} items.` : json.error || "Sync failed");
    setBusy(false); router.refresh();
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect ${connection.account_email}? Imported items remain until you delete them.`)) return;
    setBusy(true);
    const response = await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) router.refresh(); else setMessage("Disconnect failed");
  }

  return (
    <article className="connection-card">
      <div className={`provider-icon ${connection.provider}`}>{connection.provider === "google" ? "G" : "M"}</div>
      <div className="connection-copy"><b>{connection.display_name || connection.account_email}</b><p>{connection.account_email}</p><small>{connection.scopes.length} granted scopes • {connection.last_sync_at ? `last synced ${new Date(connection.last_sync_at).toLocaleString()}` : "not synced yet"}</small>{connection.last_error && <small className="error-text">{connection.last_error}</small>}</div>
      <span className={`status ${connection.status}`}>{connection.status}</span>
      <div className="connection-actions"><button className="button secondary" onClick={sync} disabled={busy}>{busy ? "Working…" : "Sync now"}</button><button className="button danger" onClick={disconnect} disabled={busy}>Disconnect</button></div>
      {message && <p className="inline-message">{message}</p>}
    </article>
  );
}
