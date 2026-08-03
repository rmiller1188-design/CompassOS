import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "You");
  return <AppShell displayName={name}>{children}</AppShell>;
}
