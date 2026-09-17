import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploader } from "@/components/file-uploader";
import { FileBrowser, type FileEntry } from "@/components/file-browser";
import styles from "./files.module.css";

export const dynamic = "force-dynamic";

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function FilesPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const [{ data: profile }, { data: files }] = await Promise.all([
    admin.from("profiles").select("personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("file_entries").select("id,file_name,content_type,size_bytes,visibility,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(500)
  ]);

  const entries = (files || []) as FileEntry[];
  const totalBytes = entries.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  const privateCount = entries.filter(file => file.visibility === "private").length;
  const sharedCount = entries.filter(file => file.visibility === "shared").length;
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = entries.filter(file => new Date(file.created_at).getTime() >= recentCutoff).length;

  return (
    <div className={styles.page}>
      <section className={`${styles.hero} card`}>
        <div>
          <p className="eyebrow">Files</p>
          <h1>Your private document workspace.</h1>
          <p>Store, find, open, download, and deliberately share files without mixing private storage into the shared Us workspace by accident.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className="button secondary" href="/app/search?type=files">Search Compass</Link>
          <Link className="button secondary" href="/app/us">Open Us</Link>
        </div>
      </section>

      <section className={styles.metrics} aria-label="File workspace summary">
        <Metric label="Files" value={String(entries.length)} note="stored in Compass"/>
        <Metric label="Storage" value={sizeLabel(totalBytes)} note="current indexed size"/>
        <Metric label="Private" value={String(privateCount)} note={`${sharedCount} explicitly shared`}/>
        <Metric label="Recent" value={String(recentCount)} note="added in last 30 days"/>
      </section>

      {profile?.personal_workspace_id && (
        <section className={`${styles.workspace} card`}>
          <div className={styles.sectionHeader}><div><p className="eyebrow">Add to Compass</p><h2>Upload a private file</h2><p>New uploads enter your personal workspace first. Sharing remains an explicit action.</p></div></div>
          <div className={styles.uploadShell}><FileUploader workspaceId={profile.personal_workspace_id}/></div>
        </section>
      )}

      <section className={`${styles.workspace} card`}>
        <div className={styles.sectionHeader}><div><p className="eyebrow">Document index</p><h2>Browse files</h2><p>Filter locally by file type or search by name, MIME type, and visibility.</p></div><span className="pill">{entries.length}</span></div>
        <FileBrowser initialFiles={entries}/>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={styles.metric}><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}
