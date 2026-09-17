"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectItemForm({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    setBusy(true);
    setMessage("");
    try {
      const dueRaw = String(form.get("dueAt") || "");
      const response = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemType: String(form.get("itemType") || "task"),
          title,
          status: String(form.get("status") || "open"),
          dueAt: dueRaw ? new Date(dueRaw).toISOString() : null,
          assignee: String(form.get("assignee") || "").trim() || null,
          referenceNumber: String(form.get("referenceNumber") || "").trim() || null,
          notes: String(form.get("notes") || "").trim() || null
        })
      });
      const json = await response.json();
      if (!response.ok || !json.item?.id) {
        setMessage("Compass could not create the project item.");
        return;
      }
      event.currentTarget.reset();
      setMessage("Added to project.");
      router.refresh();
    } catch {
      setMessage("Compass could not reach the Projects service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid two-col">
        <label><span>Type</span><select name="itemType" defaultValue="task"><option value="estimate">Estimate</option><option value="rfi">RFI</option><option value="submittal">Submittal</option><option value="task">Task</option><option value="milestone">Milestone</option><option value="issue">Issue</option><option value="note">Note</option></select></label>
        <label><span>Status</span><select name="status" defaultValue="open"><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting">Waiting</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="done">Done</option></select></label>
        <label><span>Title</span><input name="title" maxLength={220} required placeholder="RFI, submittal, estimate, follow-up…"/></label>
        <label><span>Reference #</span><input name="referenceNumber" maxLength={120} placeholder="RFI-001 / SUB-017823"/></label>
        <label><span>Due</span><input name="dueAt" type="datetime-local"/></label>
        <label><span>Assignee</span><input name="assignee" maxLength={160} placeholder="Person / company"/></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} maxLength={12000} placeholder="Scope, blocker, next action…"/></label>
      <div className="button-row"><button className="button primary" disabled={busy} type="submit">{busy ? "Adding…" : "Add item"}</button></div>
      {message && <p className="action-feedback" role="status">{message}</p>}
    </form>
  );
}
