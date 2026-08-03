"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function FileUploader({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setBusy(true); setMessage("");
    const sign = await fetch("/api/files/sign-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size, scope: "private" })
    });
    const signed = await sign.json();
    if (!sign.ok) { setMessage(signed.error || "Unable to start upload"); setBusy(false); return; }

    const supabase = createBrowserSupabaseClient();
    const result = await supabase.storage.from("compass-files").uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || "application/octet-stream"
    });
    if (result.error) { setMessage(result.error.message); setBusy(false); return; }

    const complete = await fetch("/api/files/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, path: signed.path, name: file.name, contentType: file.type || "application/octet-stream", size: file.size, scope: "private" })
    });
    const completed = await complete.json();
    setMessage(complete.ok ? "Upload complete. Refresh to view the file." : completed.error || "Unable to finish upload");
    setBusy(false);
  }

  return <div className="upload-box"><input type="file" disabled={busy} onChange={event => event.target.files?.[0] && upload(event.target.files[0])}/>{message && <p className="form-message">{message}</p>}</div>;
}
