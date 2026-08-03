import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploader } from "@/components/file-uploader";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const [{ data: profile }, { data: files }] = await Promise.all([
    admin.from("profiles").select("personal_workspace_id").eq("owner_id", user.id).eq("kind", "personal").single(),
    admin.from("file_entries").select("id,file_name,content_type,size_bytes,visibility,created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100)
  ]);
  return <div className="content-stack"><section className="card page-intro"><p className="eyebrow">Cloud files</p><h1>Private first</h1><p className="muted">Uploads go to your private workspace unless you explicitly select a shared Us workspace.</p>{profile?.personal_workspace_id&&<FileUploader workspaceId={profile.personal_workspace_id}/>}</section><section className="card"><h2>Files</h2><div className="file-list">{files?.length?files.map(file=><article className="file-row" key={file.id}><span className="file-icon">▧</span><div><b>{file.file_name}</b><p>{file.content_type} • {(file.size_bytes/1024/1024).toFixed(2)} MB</p></div><span className="pill">{file.visibility}</span></article>):<div className="empty-inline"><b>No cloud files</b><p>Use the uploader above or the iPhone Share extension.</p></div>}</div></section></div>;
}
