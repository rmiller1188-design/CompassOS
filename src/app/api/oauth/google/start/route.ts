import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, assertProfileOwner } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import { googleAuthorizationUrl } from "@/lib/providers/google";

const STATE_COOKIE = "compass_oauth_state_google";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const profileId = request.nextUrl.searchParams.get("profileId");
    if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

    await assertProfileOwner(user.id, profileId);
    const state = createOAuthState({ provider: "google", profileId, userId: user.id });
    const response = NextResponse.redirect(googleAuthorizationUrl(state));
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/oauth/google"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to begin Google OAuth";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
