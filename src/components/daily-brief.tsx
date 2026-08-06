"use client";

import { useState } from "react";

type Brief = { headline: string; urgent: string[]; schedule: string[]; shared: string[] };
type BriefMode = "local" | "ai" | null;

function briefErrorMessage(code: string | undefined): string {
  if (code === "unauthorized") return "Your session expired. Sign in again.";
  return "Compass could not generate the brief. Confirm that connected data has completed a sync.";
}

export function DailyBrief({ workspaceId }: { workspaceId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [mode, setMode] = useState<BriefMode>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true);
    setMessage("Building your private brief…");
    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      const json = await response.json();
      if (response.ok) {
        setBrief(json.brief);
        setMode(json.mode === "ai" ? "ai" : "local");
        setMessage(json.mode === "ai" ? "AI brief generated from synced Compass data." : "Brief generated locally from synced Compass data.");
      } else {
        setMessage(briefErrorMessage(json.error));
      }
    } catch {
      setMessage("Compass could not reach the Daily Brief service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card hero-card span-8">
      <div className="section-heading"><p className="eyebrow">Today</p>{mode && <span className="pill" title="Brief generation method">{mode === "ai" ? "AI enhanced" : "Local summary"}</span>}</div>
      <h1>{brief?.headline || "Your connected day will appear here."}</h1>
      {!brief && <p className="muted">Generate a private summary from synced messages, events, and follow-ups. It works locally; an OpenAI API key optionally enhances the wording.</p>}
      {brief && <div className="brief-columns"><BriefList title="Urgent" items={brief.urgent}/><BriefList title="Schedule" items={brief.schedule}/><BriefList title="Follow-ups" items={brief.shared}/></div>}
      <button className="button primary" onClick={() => void generate()} disabled={busy}>{busy ? "Building brief…" : brief ? "Refresh brief" : "Generate my brief"}</button>
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return <div><b>{title}</b>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="muted">Nothing listed.</p>}</div>;
}
