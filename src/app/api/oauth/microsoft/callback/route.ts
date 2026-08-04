import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertProfileOwner, requireApiUser } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/oauth-state";
import { exchangeMicrosoftCode, microsoftIdentity, MICROSOFT_READ_SCOPES } from "@/lib/providers/microsoft";
import { writeProviderTokens } from "@/lib/providers/vault";
import { env } from "@/lib/env";

const STATE_COOKIE = "compass_oauth_state_microsoft";

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "OAUTH_ACCESS_DENIED") return "microsoft_access_denied";
  if (message === "UNAUTHORIZED") return "sign_in_required";
  return "microsoft_connection_failed";
}

export async function GET(request: NextRequest) {
  const destination = new URL("/app/settings/connections", env.appUrl());
  let connectionId: string | null = null;

  try {
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) {
      throw new Error(providerError === "access_denied" ? "OAUTH_ACCESS_DENIED" : "OAUTH_PROVIDER_ERROR");
    }

    const user = await requireApiUser();
    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;
    if (!code || !returnedState || !cookieState || returnedState !== cookieState) {
      throw new Error("INVALID_OAUTH_CALLBACK");
    }

    const state = verifyOAuthState(returnedState);
    if (state.provider !== "microsoft" || state.userId !== user.id) throw new Error("OAUTH_SUBJECT_MISMATCH");
    await assertProfileOwner(user.id, state.profileId);

    const tokens = await exchangeMicrosoftCode(code);
    const identity = await microsoftIdentity(tokens.accessToken);
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("personal_workspace_id")
      .eq("id", state.profileId)
      .eq("owner_id", user.id)
      .single();
    if (!profile?.personal_workspace_id) throw new Error("PROFILE_WORKSPACE_NOT_FOUND");

    const scopes = tokens.scope?.split(/\s+/).filter(Boolean) || MICROSOFT_READ_SCOPES;
    const { data: connection, error } = await admin.from("provider_connections").upsert({
      owner_id: user.id,
      profile_id: state.profileId,
      workspace_id: profile.personal_workspace_id,
      provider: "microsoft",
      external_account_id: identity.externalAccountId,
      account_email: identity.email,
      display_name: identity.displayName,
      status: "reauth_required",
      scopes,
      token_expires_at: tokens.expiresAt,
      last_error: null,
      updated_at: new Date().toISOString()
    }, { onConflict: "owner_id,provider,external_account_id" }).select("id").single();
    if (error || !connection) throw error || new Error("CONNECTION_WRITE_FAILED");

    connectionId = connection.id;
    await writeProviderTokens(connection.id, tokens);
    const healthyUpdate = await admin.from("provider_connections").update({
      status: "healthy",
      token_expires_at: tokens.expiresAt,
      last_error: null,
      updated_at: new Date().toISOString()
    }).eq("id", connection.id).eq("owner_id", user.id);
    if (healthyUpdate.error) throw healthyUpdate.error;

    destination.searchParams.set("connected", "microsoft");
    const response = NextResponse.redirect(destination);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    console.error("Microsoft OAuth callback failed", error instanceof Error ? error.message : error);
    if (connectionId) {
      try {
        const admin = createAdminClient();
        await admin.from("provider_connections").update({
          status: "reauth_required",
          last_error: "MICROSOFT_CONNECTION_INCOMPLETE",
          updated_at: new Date().toISOString()
        }).eq("id", connectionId);
      } catch {
        // Preserve the original OAuth error path.
      }
    }
    destination.searchParams.set("error", publicError(error));
    const response = NextResponse.redirect(destination);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }
}
