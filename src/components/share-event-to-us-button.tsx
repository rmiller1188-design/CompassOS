"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ShareEventToUsButton({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function share() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/calendar/share-to-us", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error === "shared_workspace_required"
          ? "Create an Us workspace first."
          : "Compass could not share this event.");
        return;
      }
      setMessage("Shared to Us.");
      router.refresh();
    } catch {
      setMessage("Compass could not share this event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-cluster">
      <button className="button primary" onClick={share} disabled={busy}>{busy ? "Sharing…" : "Share to Us"}</button>
      {message && <span className="action-feedback">{message}</span>}
    </div>
  );
}
