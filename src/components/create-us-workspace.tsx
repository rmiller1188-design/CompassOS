"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateUsWorkspace() {
  const [name, setName] = useState("Us");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage("Enter a shared space name.");
      return;
    }
    setBusy(true);
    setMessage("Creating shared workspace…");
    try {
      const response = await fetch("/api/workspaces/shared", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "Unable to create workspace.");
        return;
      }
      setMessage("Shared workspace created.");
      router.refresh();
    } catch {
      setMessage("Compass could not create the shared workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="stack">
      <label>Shared space name<input value={name} onChange={event => setName(event.target.value)} maxLength={80}/></label>
      <button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create Us workspace"}</button>
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
    </form>
  );
}
