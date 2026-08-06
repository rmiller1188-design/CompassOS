import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const updateTaskSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "cancelled"])
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const taskId = z.string().uuid().parse(id);
    const input = updateTaskSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: task, error: taskError } = await admin
      .from("shared_tasks")
      .select("id,workspace_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    await assertWorkspaceMember(user.id, task.workspace_id);

    const { data, error } = await admin.from("shared_tasks").update({
      status: input.status,
      updated_at: new Date().toISOString()
    }).eq("id", taskId).select("id,title,notes,status,due_at,created_at").single();

    if (error || !data) {
      console.error("Compass task update failed", error?.code, error?.message);
      return NextResponse.json({ error: "task_update_failed" }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_task_update" }, { status: 400 });
    console.error("Compass task update request failed", message || error);
    return NextResponse.json({ error: "task_update_failed" }, { status: 500 });
  }
}
