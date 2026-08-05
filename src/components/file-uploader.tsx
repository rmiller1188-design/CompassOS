"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function FileUploader({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const sign = await fetch("/api/files/sign-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size, scope: "private" })
      });
      const signed = await sign.json();
      if (!sign.ok) {
        setMessage(signed.error || "Unable to start upload");
        return;
      }

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
        setMessage(completed.error || "Unable to finish upload");
        return;
      }
      setMessage("Upload complete.");
      router.refresh();
    } catch {
      setMessage("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="upload-box"><input type="file" disabled={busy} onChange={event => event.target.files?.[0] && upload(event.target.files[0])}/>{message && <p className="form-message">{message}</p>}</div>;
}
