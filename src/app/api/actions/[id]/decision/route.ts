import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const { decision } = bodySchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: current, error: readError } = await admin
      .from("action_requests")
      .select("id,status,risk_level")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (current.status !== "pending") return NextResponse.json({ error: "already_decided" }, { status: 409 });

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const update = decision === "approve"
      ? { status: nextStatus, approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: nextStatus, approved_by: null, approved_at: null, updated_at: new Date().toISOString() };

    const { data, error } = await admin
      .from("action_requests")
      .update(update)
      .eq("id", id)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "already_decided" }, { status: 409 });

    return NextResponse.json({ action: data, executed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    console.error("Decision Center update failed", message || error);
    return NextResponse.json({ error: "decision_failed" }, { status: 500 });
  }
}
