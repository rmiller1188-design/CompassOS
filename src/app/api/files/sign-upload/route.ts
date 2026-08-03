import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertWorkspaceMember, requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().min(1).max(240),
  contentType: z.string().min(1).max(160),
  size: z.number().int().positive().max(75 * 1024 * 1024),
  scope: z.enum(["private", "shared"])
});

const cleanName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-140);

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = bodySchema.parse(await request.json());
    await assertWorkspaceMember(user.id, input.workspaceId);
    const admin = createAdminClient();
    const path = `${input.workspaceId}/${user.id}/${crypto.randomUUID()}-${cleanName(input.fileName)}`;
    const { data, error } = await admin.storage.from("compass-files").createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("SIGNED_UPLOAD_FAILED");
    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare upload";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
