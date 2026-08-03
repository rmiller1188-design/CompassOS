"use client";

import { useState } from "react";

export function InvitePartnerForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setResult("");
    const response = await fetch("/api/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, email }) });
    const json = await response.json();
    setResult(response.ok ? `Invitation created: ${json.inviteUrl}` : json.error || "Invite failed");
    setBusy(false);
  }
  return <form onSubmit={invite} className="stack"><label>Partner email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="partner@example.com"/></label><button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>{result && <p className="form-message break-all">{result}</p>}</form>;
}
