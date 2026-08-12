import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({ eventId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { eventId } = inputSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: event, error } = await admin
      .from("calendar_events")
      .select("id,workspace_id,title,description,location,starts_at,ends_at,provider")
      .eq("id", eventId)
      .eq("owner_id", user.id)
      .neq("provider", "shared")
      .single();

    if (error || !event) return NextResponse.json({ error: "event_not_found" }, { status: 404 });
    await assertWorkspaceMember(user.id, event.workspace_id);

    const sourceMarker = `Source event: ${event.id}`;
    const { data: existing } = await admin
      .from("shared_tasks")
      .select("id,title,notes,status,due_at,created_at")
      .eq("workspace_id", event.workspace_id)
      .eq("created_by", user.id)
      .ilike("notes", `%${sourceMarker}%`)
      .maybeSingle();

    if (existing) return NextResponse.json({ task: existing, existing: true });

    const start = new Date(event.starts_at);
    const reminderTime = start.getTime() > Date.now() ? new Date(start.getTime() - 60 * 60_000).toISOString() : null;
    const notes = [
      `Event: ${event.title}`,
      `Starts: ${new Date(event.starts_at).toISOString()}`,
      event.location ? `Location: ${event.location}` : null,
      event.description || null,
      sourceMarker
    ].filter(Boolean).join("\n\n");

    const { data: task, error: insertError } = await admin.from("shared_tasks").insert({
      workspace_id: event.workspace_id,
      created_by: user.id,
      title: `Prepare for: ${event.title}`.slice(0, 180),
      notes: notes.slice(0, 4000),
      status: "open",
      due_at: reminderTime,
      updated_at: new Date().toISOString()
    }).select("id,title,notes,status,due_at,created_at").single();

    if (insertError || !task) {
      console.error("Event follow-up creation failed", insertError?.code, insertError?.message);
      return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
    }

    return NextResponse.json({ task, existing: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    console.error("Event follow-up request failed", message || error);
    return NextResponse.json({ error: "task_creation_failed" }, { status: 500 });
  }
}
