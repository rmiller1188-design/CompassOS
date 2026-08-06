import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsNav } from "@/components/settings-nav";
import { AppearanceSettings, type Accent, type ThemeMode } from "@/components/appearance-settings";

export const dynamic = "force-dynamic";

const modes = new Set<ThemeMode>(["system", "light", "dark"]);
const accents = new Set<Accent>(["violet", "blue", "green", "orange", "rose", "graphite"]);

export default async function SettingsPage() {
  const user = await requireUser();
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
  const initialMode = typeof stored.mode === "string" && modes.has(stored.mode as ThemeMode)
    ? stored.mode as ThemeMode
    : "system";
  const initialAccent = typeof stored.accent === "string" && accents.has(stored.accent as Accent)
    ? stored.accent as Accent
    : "violet";

  return (
    <div className="settings-layout">
      <SettingsNav active="appearance"/>
      <div className="content-stack">
        <section className="card page-intro">
          <p className="eyebrow">Settings</p>
          <h1>Appearance</h1>
          <p className="muted">Customize Compass without changing how your private data, connected accounts, or shared Us workspace operate.</p>
        </section>
        <AppearanceSettings initialMode={initialMode} initialAccent={initialAccent}/>
      </div>
    </div>
  );
}
