"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function FileUploader({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(file: File) {
    setBusy(true);
    setFileName(file.name);
    setMessage(`Preparing “${file.name}”…`);
    try {
      const sign = await fetch("/api/files/sign-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size, scope: "private" })
      });
      const signed = await sign.json();
      if (!sign.ok) {
        setMessage(signed.error || "Unable to start upload.");
        return;
      }

      setMessage(`Uploading “${file.name}”…`);
      const supabase = createBrowserSupabaseClient();
      const result = await supabase.storage.from("compass-files").uploadToSignedUrl(signed.path, signed.token, file, {
        contentType: file.type || "application/octet-stream"
      });
      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      const complete = await fetch("/api/files/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, path: signed.path, name: file.name, contentType: file.type || "application/octet-stream", size: file.size, scope: "private" })
      });
      const completed = await complete.json();
      if (!complete.ok) {
        setMessage(completed.error || "Unable to finish upload.");
        return;
      }
      setMessage(`Upload complete: “${file.name}.”`);
      router.refresh();
    } catch {
      setMessage("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="upload-box">
      <input ref={inputRef} className="visually-hidden-file-input" type="file" disabled={busy} onChange={event => event.target.files?.[0] && void upload(event.target.files[0])}/>
      <div className="upload-control-row">
        <button type="button" className="button secondary" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? "Uploading…" : "Choose file"}</button>
        <span className="form-message">{fileName || "No file selected"}</span>
      </div>
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
