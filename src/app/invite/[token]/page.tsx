import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AcceptInviteButton } from "@/components/accept-invite-button";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=/invite/${encodeURIComponent(token)}`);
  return <main className="signin-page"><section className="signin-card"><div className="brand-mark">♥</div><p className="eyebrow">Compass invitation</p><h1>Join the shared Us space</h1><p className="muted">Your private email, calendar, contacts, files, and messages remain private. Only items you explicitly share enter Us.</p><AcceptInviteButton token={token}/></section></main>;
}
