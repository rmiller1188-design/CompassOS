import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireApiUser();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("provider_connections")
      .select("id, profile_id, provider, account_email, display_name, status, scopes, last_sync_at, last_error, created_at")
      .eq("owner_id", user.id)
      .order("created_at");
    if (error) throw error;
    return NextResponse.json({ connections: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list connections";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
