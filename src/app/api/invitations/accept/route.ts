import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ token: z.string().min(40).max(200) });

function publicInvitationError(message: string): string {
  if (message.includes("INVITATION_EXPIRED")) return "This invitation has expired.";
  if (message.includes("INVITATION_EMAIL_MISMATCH")) return "Sign in with the email address that received this invitation.";
  if (message.includes("INVITATION_ALREADY_ACCEPTED")) return "This invitation has already been accepted.";
  if (message.includes("INVITATION_NOT_FOUND")) return "This invitation is invalid or no longer available.";
  return "Compass could not accept this invitation.";
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const { token } = schema.parse(await request.json());
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("server_accept_workspace_invitation", {
      target_user: user.id,
      target_token_hash: hash
    });
    if (error || !data) throw error || new Error("INVITATION_NOT_FOUND");

    return NextResponse.json({ accepted: true, workspaceId: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept invitation";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: publicInvitationError(message) }, { status: 400 });
  }
}
