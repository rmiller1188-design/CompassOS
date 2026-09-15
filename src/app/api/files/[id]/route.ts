import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function ownedFile(userId: string, fileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("file_entries")
    .select("id,owner_id,storage_path,file_name,content_type,size_bytes")
    .eq("id", fileId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const fileId = z.string().uuid().parse(id);
    const file = await ownedFile(user.id, fileId);
    if (!file) return NextResponse.json({ error: "file_not_found" }, { status: 404 });

    const download = request.nextUrl.searchParams.get("download") === "1";
    const admin = createAdminClient();
    const options = download ? { download: file.file_name } : undefined;
    const { data, error } = await admin.storage.from("compass-files").createSignedUrl(file.storage_path, 120, options);
    if (error || !data?.signedUrl) {
      console.error("Compass signed file URL failed", error?.message);
      return NextResponse.json({ error: "file_open_failed" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, fileName: file.file_name, contentType: file.content_type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_file" }, { status: 400 });
    console.error("Compass file URL request failed", message || error);
    return NextResponse.json({ error: "file_open_failed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const fileId = z.string().uuid().parse(id);
    const file = await ownedFile(user.id, fileId);
    if (!file) return NextResponse.json({ error: "file_not_found" }, { status: 404 });

    const admin = createAdminClient();
    const storageResult = await admin.storage.from("compass-files").remove([file.storage_path]);
    if (storageResult.error) {
      console.error("Compass storage deletion failed", storageResult.error.message);
      return NextResponse.json({ error: "file_delete_failed" }, { status: 500 });
    }

    const { error } = await admin.from("file_entries").delete().eq("id", fileId).eq("owner_id", user.id);
    if (error) {
      console.error("Compass file metadata deletion failed", error.code, error.message);
      return NextResponse.json({ error: "file_delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_file" }, { status: 400 });
    console.error("Compass file deletion request failed", message || error);
    return NextResponse.json({ error: "file_delete_failed" }, { status: 500 });
  }
}
