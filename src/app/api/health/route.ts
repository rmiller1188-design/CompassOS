import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET"
] as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const missing = REQUIRED_ENV.filter(name => !process.env[name]);

  if (missing.length) {
    return NextResponse.json({
      status: "misconfigured",
      service: "compass-os-m26",
      checkedAt,
      missing
    }, { status: 503 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("workspaces").select("id", { head: true, count: "exact" });
    if (error) {
      return NextResponse.json({
        status: "database_unavailable",
        service: "compass-os-m26",
        checkedAt,
        code: error.code || "SUPABASE_QUERY_FAILED"
      }, { status: 503 });
    }
  } catch {
    return NextResponse.json({
      status: "database_unavailable",
      service: "compass-os-m26",
      checkedAt,
      code: "SUPABASE_CLIENT_FAILED"
    }, { status: 503 });
  }

  return NextResponse.json({
    status: "ready",
    service: "compass-os-m26",
    checkedAt
  });
}
