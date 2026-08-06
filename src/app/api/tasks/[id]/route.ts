import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const updateTaskSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
  title: z.string().trim().min(1).max(180).optional(),
  notes: z.string().max(8000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
}).refine(input => Object.keys(input).length > 0, { message: "At least one task field is required." });

async function ownedTask(userId: string, taskId: string) {
  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from("shared_tasks")
    .select("id,workspace_id")
    .eq("id", taskId)
    .single();

  if (error || !task) return null;
  await assertWorkspaceMember(userId, task.workspace_id);
  return task;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const taskId = z.string().uuid().parse(id);
    const input = updateTaskSchema.parse(await request.json());
    const task = await ownedTask(user.id, taskId);
    if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.status !== undefined) changes.status = input.status;
    if (input.title !== undefined) changes.title = input.title;
    if (input.notes !== undefined) changes.notes = input.notes;
    if (input.dueAt !== undefined) changes.due_at = input.dueAt;

    const admin = createAdminClient();
    const { data, error } = await admin.from("shared_tasks").update(changes)
      .eq("id", taskId)
      .select("id,title,notes,status,due_at,created_at")
      .single();

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

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const taskId = z.string().uuid().parse(id);
    const task = await ownedTask(user.id, taskId);
    if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

    const admin = createAdminClient();
    const { error } = await admin.from("shared_tasks").delete().eq("id", taskId);
    if (error) {
      console.error("Compass task deletion failed", error.code, error.message);
      return NextResponse.json({ error: "task_delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_task" }, { status: 400 });
    console.error("Compass task deletion request failed", message || error);
    return NextResponse.json({ error: "task_delete_failed" }, { status: 500 });
  }
}
