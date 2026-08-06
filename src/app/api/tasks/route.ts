import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const createTaskSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  notes: z.string().trim().max(4000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = createTaskSchema.parse(await request.json());
    await assertWorkspaceMember(user.id, input.workspaceId);

    const admin = createAdminClient();
    const { data, error } = await admin.from("shared_tasks").insert({
      workspace_id: input.workspaceId,
      created_by: user.id,
      title: input.title,
      notes: input.notes || null,
      due_at: input.dueAt || null,
      status: "open",
      updated_at: new Date().toISOString()
    }).select("id,title,notes,status,due_at,created_at").single();

    if (error || !data) {
      console.error("Compass task creation failed", error?.code, error?.message);
      return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
    }

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_task" }, { status: 400 });
    console.error("Compass task request failed", message || error);
    return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
  }
}
