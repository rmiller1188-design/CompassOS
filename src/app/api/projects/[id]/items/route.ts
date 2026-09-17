import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const createItemSchema = z.object({
  itemType: z.enum(["estimate","rfi","submittal","task","milestone","issue","note"]),
  title: z.string().trim().min(1).max(220),
  status: z.enum(["open","in_progress","waiting","submitted","approved","rejected","done","cancelled"]).default("open"),
  dueAt: z.string().datetime().optional().nullable(),
  assignee: z.string().trim().max(160).optional().nullable(),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(12000).optional().nullable()
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const input = createItemSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin.from("projects").select("id,owner_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

    const { data, error } = await admin.from("project_items").insert({
      project_id: id,
      owner_id: user.id,
      item_type: input.itemType,
      title: input.title,
      status: input.status,
      due_at: input.dueAt || null,
      assignee: input.assignee || null,
      reference_number: input.referenceNumber || null,
      notes: input.notes || null,
      updated_at: new Date().toISOString()
    }).select("id,item_type,title,status,due_at,created_at").single();
    if (error || !data) {
      console.error("Compass project item creation failed", error?.code, error?.message);
      return NextResponse.json({ error: "project_item_creation_failed" }, { status: 500 });
    }
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_project_item" }, { status: 400 });
    console.error("Compass project item request failed", message || error);
    return NextResponse.json({ error: "project_item_creation_failed" }, { status: 500 });
  }
}
