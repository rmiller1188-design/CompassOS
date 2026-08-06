import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploader } from "@/components/file-uploader";
import { FileBrowser, type FileEntry } from "@/components/file-browser";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const [{ data: profile }, { data: files }] = await Promise.all([
    admin.from("profiles").select("personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("file_entries").select("id,file_name,content_type,size_bytes,visibility,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100)
  ]);

  return (
    <div className="content-stack">
      <section className="card page-intro">
        <p className="eyebrow">Cloud files</p>
        <h1>Private first</h1>
        <p className="muted">Uploads go to your private workspace. Click any file row to open it, or use the explicit download and delete controls.</p>
        {profile?.personal_workspace_id && <FileUploader workspaceId={profile.personal_workspace_id}/>} 
      </section>
      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">Storage</p><h2>Files</h2></div><span className="pill" title="Files stored in Compass">{files?.length || 0}</span></div>
        <FileBrowser initialFiles={(files || []) as FileEntry[]}/>
      </section>
    </div>
  );
}
