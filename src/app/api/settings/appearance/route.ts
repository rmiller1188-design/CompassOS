import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAppearance, settingsRecord } from "@/lib/personalization";

const inputSchema = z.object({
  mode: z.enum(["system", "light", "dark"]),
  accent: z.enum(["violet", "blue", "green", "orange", "rose", "graphite", "cyan", "red", "gold"]),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  radius: z.enum(["square", "soft", "round", "pill"]).default("round"),
  surface: z.enum(["solid", "glass", "paper", "midnight"]).default("glass"),
  motion: z.enum(["full", "reduced", "none"]).default("full"),
  scale: z.enum(["small", "normal", "large"]).default("normal"),
  navMode: z.enum(["expanded", "compact", "icons"]).default("expanded"),
  chrome: z.enum(["minimal", "balanced", "expressive"]).default("balanced"),
  background: z.enum(["calm", "gradient", "graphite", "warm", "ocean"]).default("calm")
});

export async function PUT(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const appearance = normalizeAppearance(inputSchema.parse(await request.json()));
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,settings")
      .eq("owner_id", user.id)
      .eq("kind", "personal")
      .single();

    if (profileError || !profile) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    const settings = { ...settingsRecord(profile.settings), appearance };
    const update = await admin.from("profiles")
      .update({ settings, updated_at: new Date().toISOString() })
      .eq("id", profile.id)
      .eq("owner_id", user.id);

    if (update.error) {
      console.error("Appearance settings update failed", update.error.code, update.error.message);
      return NextResponse.json({ error: "appearance_save_failed" }, { status: 500 });
    }

    return NextResponse.json({ appearance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_appearance" }, { status: 400 });
    console.error("Appearance settings request failed", message || error);
    return NextResponse.json({ error: "appearance_save_failed" }, { status: 500 });
  }
}
