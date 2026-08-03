import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { syncConnection } from "@/lib/providers/sync";

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const user = await requireApiUser();
    const { provider } = await context.params;
    if (!new Set(["google", "microsoft"]).has(provider)) {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }
    const body = await request.json() as { connectionId?: string };
    if (!body.connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    const counts = await syncConnection(body.connectionId, user.id);
    return NextResponse.json({ synced: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
