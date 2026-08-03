import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ token: z.string().min(40) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { token } = schema.parse(await request.json());
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();
    const { data: invite, error } = await admin.from("workspace_invitations")
      .select("id,workspace_id,email,expires_at,accepted_at")
      .eq("token_hash", hash)
      .is("accepted_at", null)
      .single();
    if (error || !invite) throw new Error("INVITATION_NOT_FOUND");
    if (Date.parse(invite.expires_at) < Date.now()) throw new Error("INVITATION_EXPIRED");
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) throw new Error("INVITATION_EMAIL_MISMATCH");
    const membership = await admin.from("workspace_members").upsert({ workspace_id: invite.workspace_id, user_id: user.id, role: "member" }, { onConflict: "workspace_id,user_id" });
    if (membership.error) throw membership.error;
    await admin.from("workspace_invitations").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", invite.id);
    return NextResponse.json({ accepted: true, workspaceId: invite.workspace_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept invitation";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
