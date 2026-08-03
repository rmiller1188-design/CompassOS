import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "compass-os-m26", time: new Date().toISOString() });
}
