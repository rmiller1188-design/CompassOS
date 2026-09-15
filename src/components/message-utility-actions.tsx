"use client";

import { useMemo, useState } from "react";

type Panel = "summary" | "draft" | null;

function clean(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function senderName(sender: string | null): string {
  const value = clean(sender);
  if (!value) return "there";
  const beforeAddress = value.split("<")[0].replace(/["']/g, "").trim();
  if (beforeAddress && !beforeAddress.includes("@")) return beforeAddress.split(/\s+/)[0];
  const address = value.match(/[\w.+-]+@([\w-]+\.)+[\w-]+/)?.[0] || value;
  const local = address.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.split(/\s+/)[0] : "there";
}

function buildSummary(body: string): string {
  const normalized = clean(body);
  if (!normalized) return "No readable message content is available to summarize.";
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 20);
  const selected = (sentences.length ? sentences : [normalized]).slice(0, 3);
  const summary = selected.join(" ");
  return summary.length > 700 ? `${summary.slice(0, 697)}…` : summary;
}

function buildDraft(subject: string | null, sender: string | null): string {
  const topic = clean(subject);
  return [
    `Hi ${senderName(sender)},`,
    "",
    topic ? `Thanks for your message about “${topic}.”` : "Thanks for your message.",
    "I received it and will review the details. I’ll follow up with next steps shortly.",
    "",
    "Thanks,"
  ].join("\n");
}

export function MessageUtilityActions({ subject, sender, body, preview }: { subject: string | null; sender: string | null; body: string | null; preview: string | null }) {
  const source = body || preview || "";
  const summary = useMemo(() => buildSummary(source), [source]);
  const draft = useMemo(() => buildDraft(subject, sender), [subject, sender]);
  const [panel, setPanel] = useState<Panel>(null);
  const [feedback, setFeedback] = useState("");

  function open(next: Exclude<Panel, null>) {
    setPanel(current => current === next ? null : next);
    setFeedback(next === "summary" ? "Summary generated from the imported message." : "Draft created locally. Nothing was sent.");
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback(`Could not copy ${label.toLowerCase()}. Select the text manually.`);
    }
  }

  const panelText = panel === "summary" ? summary : panel === "draft" ? draft : "";

  return (
    <div className="message-utilities">
      <div className="action-cluster">
        <button type="button" className={`button secondary${panel === "summary" ? " active" : ""}`} onClick={() => open("summary")} aria-pressed={panel === "summary"}>Summarize</button>
        <button type="button" className={`button secondary${panel === "draft" ? " active" : ""}`} onClick={() => open("draft")} aria-pressed={panel === "draft"}>Draft reply</button>
        <button type="button" className="button secondary" onClick={() => void copy(source || "No readable message content.", "Message")}>Copy message</button>
      </div>
      {panel && (
        <section className="message-tool-panel" aria-live="polite">
          <div className="section-heading"><div><p className="eyebrow">{panel === "summary" ? "Quick summary" : "Local draft"}</p><h2>{panel === "summary" ? "Message overview" : "Reply preview"}</h2></div><button type="button" className="text-button interactive-text-button" onClick={() => { setPanel(null); setFeedback("Panel closed."); }}>Close</button></div>
          <textarea value={panelText} readOnly rows={panel === "draft" ? 8 : 5} aria-label={panel === "summary" ? "Message summary" : "Draft reply"}/>
          <div className="button-row">
            <button type="button" className="button primary" onClick={() => void copy(panelText, panel === "summary" ? "Summary" : "Draft")}>Copy {panel === "summary" ? "summary" : "draft"}</button>
            {panel === "draft" && <span className="form-message">This is a private local draft. Compass did not send or modify email.</span>}
          </div>
        </section>
      )}
      {feedback && <p className="action-feedback" role="status" aria-live="polite">{feedback}</p>}
    </div>
  );
}
