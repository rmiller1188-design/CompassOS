import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

function safeInternalDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const appUrl = new URL(env.appUrl());
    const destination = new URL(value, appUrl);
    if (destination.origin !== appUrl.origin) return "/app";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/app";
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalDestination(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_callback_missing_code", env.appUrl()));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Supabase auth callback failed", error.message);
    return NextResponse.redirect(new URL("/sign-in?error=auth_callback_failed", env.appUrl()));
  }

  return NextResponse.redirect(new URL(next, env.appUrl()));
}
