"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const nav = [
  ["/app", "⌂", "Home"],
  ["/app/messages", "✉", "Messages"],
  ["/app/calendar", "◫", "Calendar"],
  ["/app/us", "♥", "Us"],
  ["/app/search", "⌕", "Search"]
] as const;

export function AppShell({ children, displayName }: { children: React.ReactNode; displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/app" className="brand"><span className="brand-mark small">C</span><span><b>Compass</b><small>You + Us</small></span></Link>
        <nav>
          {nav.map(([href, icon, label]) => {
            const active = href === "/app" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""}><span>{icon}</span>{label}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="profile-chip" href="/app/settings/connections"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span><b>{displayName}</b><small>Private profile</small></span></Link>
          <button className="text-button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button" onClick={() => router.back()} aria-label="Back">‹</button>
          <div className="top-title"><b>{pageTitle(pathname)}</b><small>Private by default</small></div>
          <div className="top-actions"><Link className="icon-button" href="/app/search">⌕</Link><Link className="icon-button" href="/app/settings/connections">⚙</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="mobile-nav">
        {nav.map(([href, icon, label]) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? "active" : ""}><span>{icon}</span>{label}</Link>;
        })}
      </nav>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.includes("settings")) return "Settings";
  if (pathname.includes("messages")) return "Messages";
  if (pathname.includes("calendar")) return "Calendar";
  if (pathname.includes("/us")) return "Us";
  if (pathname.includes("search")) return "Search";
  if (pathname.includes("files")) return "Files";
  return "Home";
}
