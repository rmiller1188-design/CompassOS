import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvitePartnerForm } from "@/components/invite-partner-form";
import { CreateUsWorkspace } from "@/components/create-us-workspace";

export const dynamic = "force-dynamic";

type SharedWorkspace = {
  id: string;
  name: string;
  kind: string;
  created_by: string;
};

export default async function UsPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: memberships } = await admin.from("workspace_members").select("role,workspaces(id,name,kind,created_by)").eq("user_id", user.id);

  const shared = (memberships || [])
    .flatMap(row => row.workspaces)
    .find(workspace => workspace.kind === "shared") as SharedWorkspace | undefined;

  if (!shared) {
    return (
      <div className="content-stack">
        <section className="card page-intro">
          <p className="eyebrow">Shared by consent</p>
          <h1>Create your Us space</h1>
          <p className="muted">Your partner receives their own account. Private mail, calendars, contacts, files, and memory never become shared automatically.</p>
        </section>
        <section className="card">
          <h2>Create the shared workspace</h2>
          <p className="muted">This creates the common space first. Then you can invite your partner by email.</p>
          <CreateUsWorkspace />
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="card hero-card span-8">
        <p className="eyebrow">Us</p>
        <h1>{shared.name}</h1>
        <p className="muted">Only selected items live here. Both members can revoke shared access.</p>
      </section>
      <section className="card span-4"><h2>Invite partner</h2><InvitePartnerForm workspaceId={shared.id}/></section>
      <section className="card span-6"><h2>Shared schedule</h2><p className="muted">Shared events and availability windows will appear here.</p></section>
      <section className="card span-6"><h2>Shared tasks</h2><p className="muted">Household follow-ups, bills, and plans stay separate from private profiles.</p></section>
    </div>
  );
}
