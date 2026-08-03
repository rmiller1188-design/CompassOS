import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireApiUser, assertWorkspaceMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const schema = z.object({ workspaceId: z.string().uuid(), email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const input = schema.parse(await request.json());
    const member = await assertWorkspaceMember(user.id, input.workspaceId);
    if (!new Set(["owner", "admin"]).has(member.role)) throw new Error("INVITE_FORBIDDEN");
    const admin = createAdminClient();
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const { data, error } = await admin.from("workspace_invitations").insert({
      workspace_id: input.workspaceId,
      invited_by: user.id,
      email: input.email.toLowerCase(),
      token_hash: crypto.createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
    }).select("id, expires_at").single();
    if (error) throw error;
    return NextResponse.json({ invitation: data, inviteUrl: `${env.appUrl()}/invite/${token}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invitation";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
