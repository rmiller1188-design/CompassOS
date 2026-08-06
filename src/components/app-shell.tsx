"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const nav = [
  ["/app", "⌂", "Home"],
  ["/app/messages", "✉", "Messages"],
  ["/app/calendar", "◫", "Calendar"],
  ["/app/us", "♥", "Us"],
  ["/app/search", "⌕", "Search"]
] as const;

type ThemeMode = "system" | "light" | "dark";
type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite";

function applyAppearance(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.themeMode = mode;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = accent;
  localStorage.setItem("compass-theme-mode", mode);
  localStorage.setItem("compass-accent", accent);
}

export function AppShell({ children, displayName, initialMode, initialAccent }: {
  children: React.ReactNode;
  displayName: string;
  initialMode: ThemeMode;
  initialAccent: Accent;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    applyAppearance(initialMode, initialAccent);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => initialMode === "system" && applyAppearance(initialMode, initialAccent);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [initialMode, initialAccent]);

  function goBack() {
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer?.origin === window.location.origin && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // Fall through to the safe Compass destination.
    }
    router.push("/app");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/app" className="brand" aria-label="Open Compass Home"><span className="brand-mark small">C</span><span><b>Compass</b><small>You + Us</small></span></Link>
        <nav>
          {nav.map(([href, icon, label]) => {
            const active = href === "/app" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{icon}</span>{label}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="profile-chip" href="/app/settings" aria-label="Open profile and appearance settings"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span><b>{displayName}</b><small>Private profile</small></span></Link>
          <button className="text-button interactive-text-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button" onClick={goBack} aria-label="Back" title="Back">‹</button>
          <div className="top-title"><b>{pageTitle(pathname)}</b><small>Private by default</small></div>
          <div className="top-actions"><Link className="icon-button" href="/app/search" aria-label="Search" title="Search">⌕</Link><Link className="icon-button" href="/app/settings" aria-label="Settings" title="Settings">⚙</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="mobile-nav">
        {nav.map(([href, icon, label]) => {
          const active = href === "/app" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{icon}</span>{label}</Link>;
        })}
      </nav>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.includes("settings")) return "Settings";
  if (pathname.includes("messages")) return "Messages";
  if (pathname.includes("calendar")) return "Calendar";
  if (pathname.includes("/people/")) return "Contact";
  if (pathname.includes("/us")) return "Us";
  if (pathname.includes("search")) return "Search";
  if (pathname.includes("files")) return "Files";
  return "Home";
}
