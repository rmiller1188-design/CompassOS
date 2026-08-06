"use client";

import { useState } from "react";

type FileEntry = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  visibility: string;
  created_at: string;
};

type BusyAction = { id: string; action: "open" | "download" | "delete" } | null;

function fileIcon(contentType: string): string {
  if (contentType.startsWith("image/")) return "▧";
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("csv")) return "▦";
  if (contentType.includes("word") || contentType.includes("document")) return "▤";
  if (contentType.startsWith("video/")) return "▶";
  return "□";
}

export function FileBrowser({ initialFiles }: { initialFiles: FileEntry[] }) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState("");

  async function openFile(file: FileEntry, download: boolean) {
    const action = download ? "download" : "open";
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.document.title = download ? "Preparing download…" : "Opening file…";
    setBusy({ id: file.id, action });
    setMessage("");
    try {
      const response = await fetch(`/api/files/${file.id}${download ? "?download=1" : ""}`);
      const json = await response.json();
      if (!response.ok || !json.url) {
        popup?.close();
        setMessage(`Compass could not ${action} “${file.file_name}.”`);
        return;
      }
      if (popup) {
        popup.location.replace(json.url);
      } else {
        window.location.href = json.url;
      }
      setMessage(download ? `Download started for “${file.file_name}.”` : `Opened “${file.file_name}.”`);
    } catch {
      popup?.close();
      setMessage(`Compass could not ${action} “${file.file_name}.”`);
    } finally {
      setBusy(null);
    }
  }

  async function deleteFile(file: FileEntry) {
    if (!window.confirm(`Delete “${file.file_name}” from Compass? This cannot be undone.`)) {
      setMessage("Delete cancelled.");
      return;
    }
    setBusy({ id: file.id, action: "delete" });
    setMessage("");
    try {
      const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      if (!response.ok) {
        setMessage(`Compass could not delete “${file.file_name}.”`);
        return;
      }
      setFiles(current => current.filter(item => item.id !== file.id));
      setMessage(`Deleted “${file.file_name}.”`);
    } catch {
      setMessage(`Compass could not delete “${file.file_name}.”`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="file-browser">
      {message && <p className="action-feedback" role="status" aria-live="polite">{message}</p>}
      <div className="file-list">
        {files.length ? files.map(file => {
          const fileBusy = busy?.id === file.id;
          return (
            <article className="file-row interactive-file-row" key={file.id}>
              <span className="file-icon">{fileIcon(file.content_type)}</span>
              <button type="button" className="file-main-button" onClick={() => void openFile(file, false)} disabled={fileBusy}>
                <span><b>{file.file_name}</b><p>{file.content_type} • {(file.size_bytes / 1024 / 1024).toFixed(2)} MB</p><small>Uploaded {new Date(file.created_at).toLocaleString()}</small></span>
                <span className="row-chevron" aria-hidden="true">›</span>
              </button>
              <span className="pill" title="File visibility">{file.visibility}</span>
              <div className="file-actions">
                <button type="button" className="button secondary" onClick={() => void openFile(file, false)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "open" ? "Opening…" : "Open"}</button>
                <button type="button" className="button secondary" onClick={() => void openFile(file, true)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "download" ? "Preparing…" : "Download"}</button>
                <button type="button" className="button danger" onClick={() => void deleteFile(file)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "delete" ? "Deleting…" : "Delete"}</button>
              </div>
            </article>
          );
        }) : <div className="empty-inline"><b>No cloud files</b><p>Use the uploader above or the iPhone Share extension.</p></div>}
      </div>
    </div>
  );
}

export type { FileEntry };
