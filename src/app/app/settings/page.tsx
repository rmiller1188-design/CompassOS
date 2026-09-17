import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsNav } from "@/components/settings-nav";
import { AppearanceSettings } from "@/components/appearance-settings";
import { normalizeAppearance, settingsRecord } from "@/lib/personalization";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("settings")
    .eq("owner_id", user.id)
    .eq("kind", "personal")
    .single();

  const settings = settingsRecord(profile?.settings);
  const initialAppearance = normalizeAppearance(settings.appearance);

  return (
    <div className="settings-layout">
      <SettingsNav active="appearance"/>
      <div className="content-stack">
        <section className="card page-intro" data-no-layout-edit>
          <p className="eyebrow">Settings</p>
          <h1>Personal studio</h1>
          <p className="muted">Tune the interface so Compass feels owned, finished, and personal without changing the privacy model underneath.</p>
        </section>
        <AppearanceSettings initialAppearance={initialAppearance}/>
      </div>
    </div>
  );
}
