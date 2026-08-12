import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ name: z.string().trim().min(1).max(80).default("Us") });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = schema.parse(await request.json().catch(() => ({})));
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("server_get_or_create_shared_workspace", {
      target_user: user.id,
      target_name: input.name
    });
    if (error || !data) throw error || new Error("WORKSPACE_CREATE_FAILED");

    return NextResponse.json({ workspaceId: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create shared workspace";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? message : "Unable to create the shared workspace" }, { status });
  }
}
