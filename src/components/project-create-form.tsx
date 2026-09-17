"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectCreateForm({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    setBusy(true);
    setMessage("");
    try {
      const bidDueRaw = String(form.get("bidDue") || "");
      const valueRaw = String(form.get("estimatedValue") || "").replace(/[$,]/g, "").trim();
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          clientName: String(form.get("clientName") || "").trim() || null,
          projectNumber: String(form.get("projectNumber") || "").trim() || null,
          status: String(form.get("status") || "active"),
          phase: String(form.get("phase") || "").trim() || null,
          location: String(form.get("location") || "").trim() || null,
          bidDueAt: bidDueRaw ? new Date(bidDueRaw).toISOString() : null,
          estimatedValue: valueRaw ? Number(valueRaw) : null,
          notes: String(form.get("notes") || "").trim() || null
        })
      });
      const json = await response.json();
      if (!response.ok || !json.project?.id) {
        setMessage("Compass could not create the project.");
        return;
      }
      event.currentTarget.reset();
      router.push(`/app/projects/${json.project.id}`);
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
        <label><span>Project name</span><input name="name" maxLength={160} required placeholder="Project or opportunity name"/></label>
        <label><span>Client</span><input name="clientName" maxLength={160} placeholder="Client / GC / owner"/></label>
        <label><span>Project #</span><input name="projectNumber" maxLength={80} placeholder="Internal or client number"/></label>
        <label><span>Status</span><select name="status" defaultValue="active"><option value="lead">Lead</option><option value="bidding">Bidding</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="complete">Complete</option><option value="cancelled">Cancelled</option></select></label>
        <label><span>Phase</span><input name="phase" maxLength={120} placeholder="DD / CD / bid / construction"/></label>
        <label><span>Location</span><input name="location" maxLength={240} placeholder="City, site, campus"/></label>
        <label><span>Bid / due date</span><input name="bidDue" type="datetime-local"/></label>
        <label><span>Estimated value</span><input name="estimatedValue" inputMode="decimal" placeholder="125000"/></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} maxLength={12000} placeholder="Scope, next action, constraints…"/></label>
      <div className="button-row"><button className="button primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create project"}</button></div>
      {message && <p className="action-feedback" role="status">{message}</p>}
    </form>
  );
}
