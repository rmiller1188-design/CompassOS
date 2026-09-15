import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeAppearance, normalizeLayout, settingsRecord } from "@/lib/personalization";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const name = String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "You");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("settings")
    .eq("owner_id", user.id)
    .eq("kind", "personal")
    .single();

  const settings = settingsRecord(profile?.settings);
  const appearance = normalizeAppearance(settings.appearance);
  const layout = normalizeLayout(settings.layout);

  return <AppShell displayName={name} initialAppearance={appearance} initialLayout={layout}>{children}</AppShell>;
}
