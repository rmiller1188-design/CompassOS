"use client";

import { useState } from "react";

type Brief = { headline: string; urgent: string[]; schedule: string[]; shared: string[] };

export function DailyBrief({ workspaceId }: { workspaceId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true); setError("");
    const response = await fetch("/api/ai/brief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId })
    });
    const json = await response.json();
    if (response.ok) setBrief(json.brief); else setError(json.error || "Brief failed");
    setBusy(false);
  }

  return (
    <section className="card hero-card span-8">
      <p className="eyebrow">Today</p>
      <h1>{brief?.headline || "Your connected day will appear here."}</h1>
      {!brief && <p className="muted">Generate a private summary from your synced email, calendar, and shared follow-ups.</p>}
      {brief && <div className="brief-columns"><BriefList title="Urgent" items={brief.urgent}/><BriefList title="Schedule" items={brief.schedule}/><BriefList title="Shared" items={brief.shared}/></div>}
      <button className="button primary" onClick={generate} disabled={busy}>{busy ? "Building brief…" : brief ? "Refresh brief" : "Generate my brief"}</button>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return <div><b>{title}</b>{items.length ? <ul>{items.map((x,i)=><li key={i}>{x}</li>)}</ul> : <p className="muted">Nothing listed.</p>}</div>;
}
