import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  clientName: z.string().trim().max(160).optional().nullable(),
  projectNumber: z.string().trim().max(80).optional().nullable(),
  status: z.enum(["lead","bidding","active","on_hold","complete","cancelled"]).default("active"),
  phase: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(240).optional().nullable(),
  bidDueAt: z.string().datetime().optional().nullable(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  estimatedValue: z.number().nonnegative().max(999999999999.99).optional().nullable(),
  notes: z.string().trim().max(12000).optional().nullable()
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = createProjectSchema.parse(await request.json());
    await assertWorkspaceMember(user.id, input.workspaceId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("projects").insert({
      owner_id: user.id,
      workspace_id: input.workspaceId,
      name: input.name,
      client_name: input.clientName || null,
      project_number: input.projectNumber || null,
      status: input.status,
      phase: input.phase || null,
      location: input.location || null,
      bid_due_at: input.bidDueAt || null,
      start_at: input.startAt || null,
      end_at: input.endAt || null,
      estimated_value: input.estimatedValue ?? null,
      notes: input.notes || null,
      updated_at: new Date().toISOString()
    }).select("id,name,status").single();
    if (error || !data) {
      console.error("Compass project creation failed", error?.code, error?.message);
      return NextResponse.json({ error: "project_creation_failed" }, { status: 500 });
    }
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "WORKSPACE_FORBIDDEN") return NextResponse.json({ error: "workspace_forbidden" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_project" }, { status: 400 });
    console.error("Compass project request failed", message || error);
    return NextResponse.json({ error: "project_creation_failed" }, { status: 500 });
  }
}
