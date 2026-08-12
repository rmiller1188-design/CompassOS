import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, assertProfileOwner } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import { googleAuthorizationUrl } from "@/lib/providers/google";
import { createPkcePair } from "@/lib/pkce";

const STATE_COOKIE = "compass_oauth_state_google";
const PKCE_COOKIE = "compass_oauth_pkce_google";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const profileId = request.nextUrl.searchParams.get("profileId");
    if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

    await assertProfileOwner(user.id, profileId);
    const state = createOAuthState({ provider: "google", profileId, userId: user.id });
    const pkce = createPkcePair();
    const response = NextResponse.redirect(googleAuthorizationUrl(state, pkce.challenge));
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 600,
      path: "/api/oauth/google"
    };
    response.cookies.set(STATE_COOKIE, state, cookieOptions);
    response.cookies.set(PKCE_COOKIE, pkce.verifier, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to begin Google OAuth";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
