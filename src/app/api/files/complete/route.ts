import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertWorkspaceMember, requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnedStoragePath } from "@/lib/storage-path";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  path: z.string().min(1).max(600),
  name: z.string().min(1).max(240),
  contentType: z.string().min(1).max(160),
  size: z.number().int().positive().max(75 * 1024 * 1024),
  scope: z.enum(["private", "shared"])
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = bodySchema.parse(await request.json());
    await assertWorkspaceMember(user.id, input.workspaceId);

    if (!isOwnedStoragePath({
      path: input.path,
      workspaceId: input.workspaceId,
      userId: user.id,
      visibility: input.scope
    })) {
      throw new Error("INVALID_STORAGE_PATH");
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("file_entries").insert({
      owner_id: user.id,
      workspace_id: input.workspaceId,
      storage_path: input.path,
      file_name: input.name,
      content_type: input.contentType,
      size_bytes: input.size,
      visibility: input.scope
    }).select("id, storage_path, file_name, visibility, created_at").single();

    if (error) throw error;
    return NextResponse.json({ file: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete upload";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
