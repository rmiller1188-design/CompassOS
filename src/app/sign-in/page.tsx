import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignInForm } from "@/components/sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const { next = "/app" } = await searchParams;
  if (user) redirect(next.startsWith("/") ? next : "/app");
  return <main className="signin-page"><SignInForm nextPath={next.startsWith("/") ? next : "/app"} /></main>;
}
