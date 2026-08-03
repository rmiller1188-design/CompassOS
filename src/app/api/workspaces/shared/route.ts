import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ name: z.string().min(1).max(80).default("Us") });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = schema.parse(await request.json().catch(() => ({})));
    const admin = createAdminClient();
    const { data: existing } = await admin.from("workspace_members").select("workspace_id,workspaces!inner(id,name,kind)").eq("user_id", user.id).eq("workspaces.kind", "shared").limit(1).maybeSingle();
    if (existing?.workspace_id) return NextResponse.json({ workspaceId: existing.workspace_id, existing: true });
    const { data: workspace, error } = await admin.from("workspaces").insert({ name: input.name, kind: "shared", created_by: user.id }).select("id,name").single();
    if (error || !workspace) throw error || new Error("WORKSPACE_CREATE_FAILED");
    const membership = await admin.from("workspace_members").insert({ workspace_id: workspace.id, user_id: user.id, role: "owner" });
    if (membership.error) throw membership.error;
    return NextResponse.json({ workspaceId: workspace.id, workspace }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create shared workspace";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
