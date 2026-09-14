"use client";

import { useMemo, useState } from "react";
import styles from "./file-browser.module.css";

type FileEntry = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  visibility: string;
  created_at: string;
};

type BusyAction = { id: string; action: "open" | "download" | "delete" } | null;
type FileKind = "all" | "documents" | "spreadsheets" | "pdf" | "images" | "video";

function fileKind(contentType: string, fileName: string): Exclude<FileKind, "all"> | "other" {
  const type = contentType.toLocaleLowerCase();
  const name = fileName.toLocaleLowerCase();
  if (type.startsWith("image/")) return "images";
  if (type.startsWith("video/")) return "video";
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv") || /\.(xlsx?|csv)$/.test(name)) return "spreadsheets";
  if (type.includes("word") || type.includes("document") || type.includes("text") || /\.(docx?|txt|rtf)$/.test(name)) return "documents";
  return "other";
}

function fileIcon(contentType: string, fileName: string): string {
  const kind = fileKind(contentType, fileName);
  if (kind === "images") return "▧";
  if (kind === "pdf") return "PDF";
  if (kind === "spreadsheets") return "▦";
  if (kind === "documents") return "▤";
  if (kind === "video") return "▶";
  return "□";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const filters: { value: FileKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "documents", label: "Documents" },
  { value: "spreadsheets", label: "Spreadsheets" },
  { value: "pdf", label: "PDFs" },
  { value: "images", label: "Images" },
  { value: "video", label: "Video" }
];

export function FileBrowser({ initialFiles }: { initialFiles: FileEntry[] }) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FileKind>("all");

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return files.filter(file => {
      const matchesQuery = !needle || `${file.file_name} ${file.content_type} ${file.visibility}`.toLocaleLowerCase().includes(needle);
      const matchesKind = kind === "all" || fileKind(file.content_type, file.file_name) === kind;
      return matchesQuery && matchesKind;
    });
  }, [files, query, kind]);

  const filterCounts = useMemo(() => {
    const counts: Record<FileKind, number> = { all: files.length, documents: 0, spreadsheets: 0, pdf: 0, images: 0, video: 0 };
    for (const file of files) {
      const value = fileKind(file.content_type, file.file_name);
      if (value !== "other") counts[value] += 1;
    }
    return counts;
  }, [files]);

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
      if (popup) popup.location.replace(json.url);
      else window.open(json.url, "_blank", "noopener,noreferrer");
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
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <input className={styles.search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a file by name, type, or visibility…" aria-label="Search files"/>
        <div className={styles.filters} aria-label="File type filter">
          {filters.map(filter => <button type="button" key={filter.value} className={`${styles.filter}${kind === filter.value ? ` ${styles.active}` : ""}`} onClick={() => setKind(filter.value)}>{filter.label} · {filterCounts[filter.value]}</button>)}
        </div>
      </div>
      <div className={styles.summary}><span>{visibleFiles.length} shown · {files.length} total</span><span>{query || kind !== "all" ? "Filtered view" : "Private file index"}</span></div>
      {message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
      <div className={styles.list}>
        {visibleFiles.length ? visibleFiles.map(file => {
          const fileBusy = busy?.id === file.id;
          return (
            <article className={styles.row} key={file.id}>
              <span className={styles.icon}>{fileIcon(file.content_type, file.file_name)}</span>
              <button type="button" className={styles.main} onClick={() => void openFile(file, false)} disabled={fileBusy}>
                <b>{file.file_name}</b><p>{file.content_type} · {sizeLabel(file.size_bytes)}</p><small>Uploaded {new Date(file.created_at).toLocaleString()}</small>
              </button>
              <div className={styles.meta}><span className={styles.visibility}>{file.visibility}</span></div>
              <div className={styles.actions}>
                <button type="button" className="button secondary" onClick={() => void openFile(file, false)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "open" ? "Opening…" : "Open"}</button>
                <button type="button" className="button secondary" onClick={() => void openFile(file, true)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "download" ? "Preparing…" : "Download"}</button>
                <button type="button" className="button danger" onClick={() => void deleteFile(file)} disabled={fileBusy}>{busy?.id === file.id && busy.action === "delete" ? "Deleting…" : "Delete"}</button>
              </div>
            </article>
          );
        }) : <div className={styles.empty}><b>No files match this view.</b><p>Clear the search or choose another file type.</p></div>}
      </div>
    </div>
  );
}

export type { FileEntry };
