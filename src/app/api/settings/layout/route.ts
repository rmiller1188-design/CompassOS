import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLayout, settingsRecord } from "@/lib/personalization";

const ruleSchema = z.object({
  order: z.number().int().optional(),
  size: z.enum(["auto", "compact", "wide", "full"]).optional(),
  hidden: z.boolean().optional()
});
const inputSchema = z.object({ layout: z.record(z.string(), z.record(z.string(), ruleSchema)) });

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = inputSchema.parse(await request.json());
    const layout = normalizeLayout(input.layout);
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,settings")
      .eq("owner_id", user.id)
      .eq("kind", "personal")
      .single();

    if (profileError || !profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    const settings = { ...settingsRecord(profile.settings), layout };
    const update = await admin.from("profiles")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", profile.id)
      .eq("owner_id", user.id);

    if (update.error) {
      console.error("Layout settings update failed", update.error.code, update.error.message);
      return NextResponse.json({ error: "layout_save_failed" }, { status: 500 });
    }

    return NextResponse.json({ layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_layout" }, { status: 400 });
    console.error("Layout settings request failed", message || error);
    return NextResponse.json({ error: "layout_save_failed" }, { status: 500 });
  }
}
