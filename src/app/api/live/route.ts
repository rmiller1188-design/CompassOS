import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "live",
    service: "compass-os-m26",
    checkedAt: new Date().toISOString()
  });
}
