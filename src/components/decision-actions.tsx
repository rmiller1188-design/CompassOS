"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DecisionActions({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setMessage("");
    try {
      const response = await fetch(`/api/actions/${requestId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error === "already_decided" ? "This request was already decided." : "Compass could not update this request.");
        return;
      }
      setMessage(decision === "approve" ? "Approved. Compass has not executed it yet." : "Rejected.");
      router.refresh();
    } catch {
      setMessage("Compass could not reach the Decision Center service.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="button-row">
        <button className="button primary" type="button" disabled={Boolean(busy)} onClick={() => void decide("approve")}>{busy === "approve" ? "Approving…" : "Approve"}</button>
        <button className="button danger" type="button" disabled={Boolean(busy)} onClick={() => void decide("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</button>
      </div>
      {message && <p className="action-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
