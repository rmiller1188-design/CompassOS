"use client";

import { useState } from "react";

type Brief = { headline: string; urgent: string[]; schedule: string[]; followUps: string[] };
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
    setMessage("Building your private executive brief…");
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
        setMessage(json.mode === "ai" ? "AI brief generated from synced Compass data." : "Executive brief generated locally from synced Compass data.");
      } else {
        setMessage(briefErrorMessage(json.error));
      }
    } catch {
      setMessage("Compass could not reach the Executive Brief service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card hero-card span-8">
      <div className="section-heading"><div><p className="eyebrow">Executive brief</p><h2>What deserves your attention</h2></div>{mode && <span className="pill" title="Brief generation method">{mode === "ai" ? "AI enhanced" : "Local summary"}</span>}</div>
      <h1>{brief?.headline || "Your connected operating brief will appear here."}</h1>
      {!brief && <p className="muted">Generate a private, source-aware summary from synced communications, account health, schedule, and follow-ups. Compass keeps a deterministic local fallback if AI generation is unavailable.</p>}
      {brief && <div className="brief-columns"><BriefList title="Needs attention" items={brief.urgent}/><BriefList title="Schedule" items={brief.schedule}/><BriefList title="Follow-ups" items={brief.followUps}/></div>}
      <button className="button primary" onClick={() => void generate()} disabled={busy}>{busy ? "Building brief…" : brief ? "Refresh executive brief" : "Generate executive brief"}</button>
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return <div><b>{title}</b>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="muted">Nothing listed.</p>}</div>;
}
