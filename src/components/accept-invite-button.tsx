"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function accept() {
    setBusy(true);
    setMessage("Joining the shared workspace…");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      const json = await response.json();
      if (response.ok) {
        setMessage("Invitation accepted. Opening Us…");
        router.replace("/app/us");
        router.refresh();
        return;
      }
      setMessage(json.error || "Unable to accept invitation.");
    } catch {
      setMessage("Compass could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button className="button primary" onClick={() => void accept()} disabled={busy}>{busy ? "Joining…" : "Join Us"}</button>
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
