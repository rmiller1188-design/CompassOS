import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ThemeMode = "system" | "light" | "dark";
type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite";

const modes = new Set<ThemeMode>(["system", "light", "dark"]);
const accents = new Set<Accent>(["violet", "blue", "green", "orange", "rose", "graphite"]);

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

  const settings = profile?.settings && typeof profile.settings === "object" && !Array.isArray(profile.settings)
    ? profile.settings as Record<string, unknown>
    : {};
  const stored = settings.appearance && typeof settings.appearance === "object" && !Array.isArray(settings.appearance)
    ? settings.appearance as Record<string, unknown>
    : {};
  const mode = typeof stored.mode === "string" && modes.has(stored.mode as ThemeMode)
    ? stored.mode as ThemeMode
    : "system";
  const accent = typeof stored.accent === "string" && accents.has(stored.accent as Accent)
    ? stored.accent as Accent
    : "violet";

  return <AppShell displayName={name} initialMode={mode} initialAccent={accent}>{children}</AppShell>;
}
