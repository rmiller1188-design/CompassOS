import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_SHARE_SIZE = 50 * 1024 * 1024;
const cleanName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-140);

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateBearer(request);
    const workspaceId = request.headers.get("x-compass-workspace");
    const visibility = request.headers.get("x-compass-scope") === "shared" ? "shared" : "private";
    if (!workspaceId) return NextResponse.json({ error: "Missing X-Compass-Workspace" }, { status: 400 });
    await assertWorkspaceMember(user.id, workspaceId);

    const form = await request.formData();
    const note = String(form.get("note") || "").slice(0, 10_000);
    const sourceUrl = String(form.get("sourceUrl") || "").slice(0, 2_000) || null;
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const admin = createAdminClient();
    const inserted: unknown[] = [];

    if (!files.length && (note || sourceUrl)) {
      const { data, error } = await admin.from("share_intake_items").insert({
        owner_id: user.id,
        workspace_id: workspaceId,
        visibility,
        item_type: sourceUrl ? "url" : "text",
        note,
        source_url: sourceUrl,
        status: "ready"
      }).select().single();
      if (error) throw error;
      inserted.push(data);
    }

    for (const file of files) {
      if (file.size > MAX_SHARE_SIZE) throw new Error(`${file.name} exceeds 50 MB`);
      const path = `${workspaceId}/${user.id}/share-${crypto.randomUUID()}-${cleanName(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const upload = await admin.storage.from("compass-files").upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });
      if (upload.error) throw upload.error;
      const fileEntry = await admin.from("file_entries").insert({
        owner_id: user.id,
        workspace_id: workspaceId,
        storage_path: path,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        visibility
      }).select("id").single();
      if (fileEntry.error) throw fileEntry.error;
      const intake = await admin.from("share_intake_items").insert({
        owner_id: user.id,
        workspace_id: workspaceId,
        visibility,
        item_type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file",
        note,
        source_url: sourceUrl,
        file_entry_id: fileEntry.data.id,
        status: "ready"
      }).select().single();
      if (intake.error) throw intake.error;
      inserted.push(intake.data);
    }
    return NextResponse.json({ accepted: inserted.length, items: inserted }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Share intake failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
