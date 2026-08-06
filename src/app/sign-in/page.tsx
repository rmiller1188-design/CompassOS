import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "@/components/sign-in-form";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  return value;
}

function authMessage(code: string | undefined): string {
  switch (code) {
    case "auth_callback_missing_code":
      return "The sign-in link was incomplete or expired. Request a new one.";
    case "auth_callback_failed":
      return "Compass could not complete sign-in. Request a new link or retry your social login.";
    default:
      return "";
  }
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const next = safeNext(params.next);
  if (user) redirect(next);

  return <main className="signin-page"><SignInForm nextPath={next} initialMessage={authMessage(params.error)} /></main>;
}
