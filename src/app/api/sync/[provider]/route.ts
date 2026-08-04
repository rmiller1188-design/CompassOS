import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { syncConnection } from "@/lib/providers/sync";
import type { ProviderName } from "@/lib/providers/types";

const bodySchema = z.object({ connectionId: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const user = await requireApiUser();
    const { provider } = await context.params;
    if (provider !== "google" && provider !== "microsoft") {
      return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
    }

    const { connectionId } = bodySchema.parse(await request.json());
    const counts = await syncConnection(connectionId, user.id, provider as ProviderName);
    return NextResponse.json({ synced: true, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (message === "SYNC_ALREADY_RUNNING") return NextResponse.json({ error: "sync_already_running" }, { status: 409 });
    if (message === "CONNECTION_NOT_FOUND") return NextResponse.json({ error: "connection_not_found" }, { status: 404 });
    if (message === "PROVIDER_CONNECTION_MISMATCH") return NextResponse.json({ error: "provider_connection_mismatch" }, { status: 400 });
    if (message === "PROVIDER_REAUTH_REQUIRED" || /^(GOOGLE_TOKEN_REFRESH|MICROSOFT_TOKEN_REFRESH|GOOGLE_API_401|MICROSOFT_GRAPH_401)/.test(message)) {
      return NextResponse.json({ error: "provider_reauthorization_required" }, { status: 409 });
    }
    console.error("Compass provider sync failed", message || error);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}
