"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EventUtilityActions({ eventId, title, startsAt, endsAt, location, description }: {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const details = [
    title,
    `${new Date(startsAt).toLocaleString()} — ${new Date(endsAt).toLocaleString()}`,
    location ? `Location: ${location}` : null,
    description || null
  ].filter(Boolean).join("\n\n");

  async function createFollowUp() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tasks/from-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage("Compass could not create the event follow-up.");
        return;
      }
      setMessage(json.existing ? "This event already has a private follow-up." : "Private event follow-up created.");
      router.refresh();
    } catch {
      setMessage("Compass could not create the event follow-up.");
    } finally {
      setBusy(false);
    }
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(details);
      setMessage("Event details copied.");
    } catch {
      setMessage("Could not copy event details.");
    }
  }

  return (
    <div className="event-utility-actions">
      <div className="action-cluster">
        <button type="button" className="button secondary" onClick={() => void createFollowUp()} disabled={busy}>{busy ? "Creating…" : "Create follow-up"}</button>
        <button type="button" className="button secondary" onClick={() => void copyDetails()}>Copy details</button>
      </div>
      {message && <span className="action-feedback" role="status" aria-live="polite">{message}</span>}
    </div>
  );
}
