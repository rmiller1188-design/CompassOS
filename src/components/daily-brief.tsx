"use client";

import { useState } from "react";

type Brief = { headline: string; urgent: string[]; schedule: string[]; shared: string[] };

function briefErrorMessage(code: string | undefined): string {
  if (code === "ai_not_configured") return "Daily Brief needs an OpenAI API key in Render. The rest of Compass works without it.";
  if (code === "unauthorized") return "Your session expired. Sign in again.";
  return "Compass could not generate the brief. Confirm synced data and the OpenAI API configuration.";
}

export function DailyBrief({ workspaceId }: { workspaceId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      const json = await response.json();
      if (response.ok) setBrief(json.brief);
      else setError(briefErrorMessage(json.error));
    } catch {
      setError("Compass could not reach the Daily Brief service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card hero-card span-8">
      <p className="eyebrow">Today</p>
      <h1>{brief?.headline || "Your connected day will appear here."}</h1>
      {!brief && <p className="muted">Generate a private summary after provider data has been synced. This optional feature also requires an OpenAI API key.</p>}
      {brief && <div className="brief-columns"><BriefList title="Urgent" items={brief.urgent}/><BriefList title="Schedule" items={brief.schedule}/><BriefList title="Shared" items={brief.shared}/></div>}
      <button className="button primary" onClick={generate} disabled={busy}>{busy ? "Building brief…" : brief ? "Refresh brief" : "Generate my brief"}</button>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return <div><b>{title}</b>{items.length ? <ul>{items.map((x,i)=><li key={i}>{x}</li>)}</ul> : <p className="muted">Nothing listed.</p>}</div>;
}
