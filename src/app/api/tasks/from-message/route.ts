import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({
  messageId: z.string().uuid(),
  destination: z.enum(["personal", "shared"]).default("personal")
});

type JoinedWorkspace = { id: string; kind: string };

async function sharedWorkspaceId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id,workspaces(id,kind)")
    .eq("user_id", userId);

  for (const row of data || []) {
    const joined = row.workspaces as JoinedWorkspace | JoinedWorkspace[] | null;
    const workspaces = Array.isArray(joined) ? joined : joined ? [joined] : [];
    const shared = workspaces.find(workspace => workspace.kind === "shared");
    if (shared) return shared.id;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = inputSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: message, error } = await admin
      .from("communication_items")
      .select("id,workspace_id,subject,sender,preview,occurred_at")
      .eq("id", input.messageId)
      .eq("owner_id", user.id)
      .single();

    if (error || !message) return NextResponse.json({ error: "message_not_found" }, { status: 404 });

    let workspaceId = message.workspace_id;
    if (input.destination === "shared") {
      const sharedId = await sharedWorkspaceId(user.id);
      if (!sharedId) return NextResponse.json({ error: "shared_workspace_required" }, { status: 409 });
      workspaceId = sharedId;
    }
    await assertWorkspaceMember(user.id, workspaceId);

    const sourceMarker = `Source message: ${message.id}`;
    const { data: existing } = await admin
      .from("shared_tasks")
      .select("id,title,notes,status,due_at,created_at")
      .eq("workspace_id", workspaceId)
      .eq("created_by", user.id)
      .ilike("notes", `%${sourceMarker}%`)
      .maybeSingle();

    if (existing) return NextResponse.json({ task: existing, existing: true });

    const subject = message.subject || message.sender || "Message";
    const notes = [
      message.sender ? `From: ${message.sender}` : null,
      `Received: ${new Date(message.occurred_at).toISOString()}`,
      message.preview || null,
      sourceMarker
    ].filter(Boolean).join("\n\n");

    const { data: task, error: insertError } = await admin.from("shared_tasks").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      title: `Follow up: ${subject}`.slice(0, 180),
      notes: notes.slice(0, 4000),
      status: "open",
      updated_at: new Date().toISOString()
    }).select("id,title,notes,status,due_at,created_at").single();

    if (insertError || !task) {
      console.error("Message follow-up creation failed", insertError?.code, insertError?.message);
      return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
    }

    return NextResponse.json({ task, existing: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    console.error("Message follow-up request failed", message || error);
    return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
  }
}
