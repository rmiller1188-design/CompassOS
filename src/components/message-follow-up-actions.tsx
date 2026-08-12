"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MessageFollowUpActions({ messageId, hasSharedWorkspace }: { messageId: string; hasSharedWorkspace: boolean }) {
  const [busy, setBusy] = useState<"personal" | "shared" | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function create(destination: "personal" | "shared") {
    setBusy(destination);
    setMessage("");
    try {
      const response = await fetch("/api/tasks/from-message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, destination })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error === "shared_workspace_required"
          ? "Create an Us workspace before adding a shared follow-up."
          : "Compass could not create the follow-up.");
        return;
      }
      setMessage(json.existing
        ? destination === "shared" ? "This message is already in Us follow-ups." : "This message already has a private follow-up."
        : destination === "shared" ? "Added to Us follow-ups." : "Private follow-up created.");
      router.refresh();
    } catch {
      setMessage("Compass could not create the follow-up.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="action-cluster">
      <button className="button primary" onClick={() => create("personal")} disabled={Boolean(busy)}>
        {busy === "personal" ? "Creating…" : "Create follow-up"}
      </button>
      {hasSharedWorkspace && (
        <button className="button secondary" onClick={() => create("shared")} disabled={Boolean(busy)}>
          {busy === "shared" ? "Adding…" : "Add to Us"}
        </button>
      )}
      {message && <span className="action-feedback">{message}</span>}
    </div>
  );
}
