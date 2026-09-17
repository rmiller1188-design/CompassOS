import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({ eventId: z.string().uuid() });
type JoinedWorkspace = { id: string; kind: string };

async function findSharedWorkspace(userId: string): Promise<string | null> {
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
    const { eventId } = inputSchema.parse(await request.json());
    const admin = createAdminClient();
    const sharedWorkspaceId = await findSharedWorkspace(user.id);

    if (!sharedWorkspaceId) {
      return NextResponse.json({ error: "shared_workspace_required" }, { status: 409 });
    }
    await assertWorkspaceMember(user.id, sharedWorkspaceId);

    const { data: source, error: sourceError } = await admin
      .from("calendar_events")
      .select("id,profile_id,connection_id,provider,external_id,title,description,location,starts_at,ends_at,all_day,attendees,raw_metadata")
      .eq("id", eventId)
      .eq("owner_id", user.id)
      .neq("provider", "shared")
      .single();

    if (sourceError || !source) return NextResponse.json({ error: "event_not_found" }, { status: 404 });

    const raw = source.raw_metadata && typeof source.raw_metadata === "object"
      ? source.raw_metadata as Record<string, unknown>
      : {};
    const sharedExternalId = `${sharedWorkspaceId}:${source.id}`;

    const payload = {
      owner_id: user.id,
      workspace_id: sharedWorkspaceId,
      profile_id: source.profile_id,
      connection_id: source.connection_id,
      provider: "shared",
      external_id: sharedExternalId,
      title: source.title,
      description: source.description,
      location: source.location,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
      all_day: source.all_day,
      attendees: source.attendees || [],
      raw_metadata: {
        ...raw,
        sharedFromEventId: source.id,
        sourceProvider: source.provider,
        sourceExternalId: source.external_id,
        sharedBy: user.id,
        sharedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };

    let result;
    if (source.connection_id) {
      result = await admin.from("calendar_events").upsert(payload, {
        onConflict: "provider,connection_id,external_id"
      }).select("id,title,starts_at,ends_at,location").single();
    } else {
      const existing = await admin.from("calendar_events")
        .select("id")
        .eq("workspace_id", sharedWorkspaceId)
        .eq("provider", "shared")
        .eq("external_id", sharedExternalId)
        .maybeSingle();
      result = existing.data
        ? await admin.from("calendar_events").update(payload).eq("id", existing.data.id).select("id,title,starts_at,ends_at,location").single()
        : await admin.from("calendar_events").insert(payload).select("id,title,starts_at,ends_at,location").single();
    }

    if (result.error || !result.data) {
      console.error("Share event to Us failed", result.error?.code, result.error?.message);
      return NextResponse.json({ error: "event_share_failed" }, { status: 500 });
    }

    return NextResponse.json({ event: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    console.error("Share event to Us request failed", message || error);
    return NextResponse.json({ error: "event_share_failed" }, { status: 500 });
  }
}
