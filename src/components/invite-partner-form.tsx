"use client";

import { useState } from "react";

export function InvitePartnerForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult("");
    setInviteUrl("");
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, email })
      });
      const json = await response.json();
      if (response.ok && json.inviteUrl) {
        setInviteUrl(json.inviteUrl);
        setResult("Invitation created. Copy the secure link and send it to your partner.");
      } else {
        setResult(json.error || "Invite failed.");
      }
    } catch {
      setResult("Compass could not create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setResult("Invitation link copied.");
    } catch {
      setResult("Could not copy the link. Select it manually below.");
    }
  }

  return (
    <form onSubmit={invite} className="stack">
      <label>Partner email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="partner@example.com"/></label>
      <button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>
      {inviteUrl && (
        <div className="invite-result">
          <input value={inviteUrl} readOnly aria-label="Invitation link" onFocus={event => event.currentTarget.select()}/>
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => void copyInvite()}>Copy link</button>
            <a className="button secondary" href={inviteUrl} target="_blank" rel="noreferrer">Open invitation</a>
          </div>
        </div>
      )}
      {result && <p className="form-message break-all" role="status" aria-live="polite">{result}</p>}
    </form>
  );
}
