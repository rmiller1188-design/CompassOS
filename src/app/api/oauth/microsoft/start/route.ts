import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, assertProfileOwner } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauth-state";
import { microsoftAuthorizationUrl } from "@/lib/providers/microsoft";
import { createPkcePair } from "@/lib/pkce";

const STATE_COOKIE = "compass_oauth_state_microsoft";
const PKCE_COOKIE = "compass_oauth_pkce_microsoft";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const profileId = request.nextUrl.searchParams.get("profileId");
    if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

    await assertProfileOwner(user.id, profileId);
    const state = createOAuthState({ provider: "microsoft", profileId, userId: user.id });
    const pkce = createPkcePair();
    const response = NextResponse.redirect(microsoftAuthorizationUrl(state, pkce.challenge));
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 600,
      path: "/api/oauth/microsoft"
    };
    response.cookies.set(STATE_COOKIE, state, cookieOptions);
    response.cookies.set(PKCE_COOKIE, pkce.verifier, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to begin Microsoft OAuth";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
