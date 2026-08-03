import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertProfileOwner, requireApiUser } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/oauth-state";
import { exchangeMicrosoftCode, microsoftIdentity, MICROSOFT_READ_SCOPES } from "@/lib/providers/microsoft";
import { writeProviderTokens } from "@/lib/providers/vault";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const destination = new URL("/app/settings/connections", env.appUrl());
  try {
    const user = await requireApiUser();
    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");
    const cookieState = request.cookies.get("compass_oauth_state")?.value;
    if (!code || !returnedState || !cookieState || returnedState !== cookieState) throw new Error("INVALID_OAUTH_CALLBACK");
    const state = verifyOAuthState(returnedState);
    if (state.provider !== "microsoft" || state.userId !== user.id) throw new Error("OAUTH_SUBJECT_MISMATCH");
    await assertProfileOwner(user.id, state.profileId);
    const tokens = await exchangeMicrosoftCode(code);
    const identity = await microsoftIdentity(tokens.accessToken);
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("personal_workspace_id").eq("id", state.profileId).single();
    if (!profile?.personal_workspace_id) throw new Error("PROFILE_WORKSPACE_NOT_FOUND");
    const { data: connection, error } = await admin.from("provider_connections").upsert({
      owner_id: user.id,
      profile_id: state.profileId,
      workspace_id: profile.personal_workspace_id,
      provider: "microsoft",
      external_account_id: identity.externalAccountId,
      account_email: identity.email,
      display_name: identity.displayName,
      status: "healthy",
      scopes: tokens.scope?.split(" ") || MICROSOFT_READ_SCOPES,
      token_expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString()
    }, { onConflict: "owner_id,provider,external_account_id" }).select("id").single();
    if (error || !connection) throw error || new Error("CONNECTION_WRITE_FAILED");
    await writeProviderTokens(connection.id, tokens);
    destination.searchParams.set("connected", "microsoft");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("compass_oauth_state");
    return response;
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "Microsoft connection failed");
    const response = NextResponse.redirect(destination);
    response.cookies.delete("compass_oauth_state");
    return response;
  }
}
