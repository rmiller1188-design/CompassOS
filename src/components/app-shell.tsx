"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CommandPalette } from "@/components/command-palette";
import { LayoutStudio } from "@/components/layout-studio";
import { applyAppearance } from "@/components/appearance-settings";
import type { AppearanceProfile, LayoutSettings } from "@/lib/personalization";

const desktopNav = [
  { href: "/app", icon: "⌂", label: "Mission Control", exact: true },
  { href: "/app/messages", icon: "✉", label: "Communications" },
  { href: "/app/calendar", icon: "◷", label: "Calendar" },
  { href: "/app/projects", icon: "◆", label: "Projects" },
  { href: "/app/people", icon: "◎", label: "People" },
  { href: "/app/files", icon: "▣", label: "Files" },
  { href: "/app/decisions", icon: "✓", label: "Decisions" },
  { href: "/app/us", icon: "♡", label: "Us" },
  { href: "/app/settings/connections", icon: "↔", label: "Connections" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

const mobileNav = [
  { href: "/app", icon: "⌂", label: "Mission", exact: true },
  { href: "/app/messages", icon: "✉", label: "Comms" },
  { href: "/app/calendar", icon: "◷", label: "Calendar" },
  { href: "/app/projects", icon: "◆", label: "Projects" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

type NavigationItem = { href: string; icon: string; label: string; exact?: boolean };

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppShell({ children, displayName, initialAppearance, initialLayout }: {
  children: React.ReactNode;
  displayName: string;
  initialAppearance: AppearanceProfile;
  initialLayout: LayoutSettings;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    applyAppearance(initialAppearance);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => initialAppearance.mode === "system" && applyAppearance(initialAppearance);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [initialAppearance]);

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
      <aside className="sidebar" data-no-layout-edit>
        <Link href="/app" className="brand" aria-label="Open Mission Control"><span className="brand-mark small">C</span><span><b>CompassOS</b><small>Your workspace</small></span></Link>
        <nav aria-label="Primary navigation">
          {desktopNav.map(item => {
            const active = isActive(pathname, item);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="profile-chip" href="/app/settings" aria-label="Open personalization settings"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span><b>{displayName}</b><small>Personal studio</small></span></Link>
          <button className="text-button interactive-text-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar" data-no-layout-edit>
          <button className="icon-button" onClick={goBack} aria-label="Back" title="Back">‹</button>
          <div className="top-title"><b>{pageTitle(pathname)}</b><small>{pageContext(pathname)}</small></div>
          <div className="top-actions"><CommandPalette/><LayoutStudio initialLayout={initialLayout}/><Link className="icon-button" href="/app/settings" aria-label="Personal studio" title="Personal studio">✣</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation" data-no-layout-edit>
        {mobileNav.map(item => {
          const active = isActive(pathname, item);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{item.icon}</span>{item.label}</Link>;
        })}
      </nav>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/app/settings/connections")) return "Connections";
  if (pathname.startsWith("/app/settings")) return "Personal studio";
  if (pathname.startsWith("/app/messages")) return "Communications";
  if (pathname.startsWith("/app/calendar")) return "Calendar";
  if (pathname.startsWith("/app/projects")) return "Projects";
  if (pathname.includes("/people/")) return "Contact";
  if (pathname.startsWith("/app/people")) return "People";
  if (pathname.startsWith("/app/decisions")) return "Decisions";
  if (pathname.startsWith("/app/us")) return "Us";
  if (pathname.startsWith("/app/search")) return "Search";
  if (pathname.startsWith("/app/files")) return "Files";
  return "Mission Control";
}

function pageContext(pathname: string) {
  if (pathname.startsWith("/app/messages")) return "Outlook · Gmail · Texts";
  if (pathname.startsWith("/app/projects")) return "Bids · delivery · records";
  if (pathname.startsWith("/app/decisions")) return "Review queue";
  if (pathname.startsWith("/app/settings/connections")) return "Accounts and permissions";
  if (pathname.startsWith("/app/settings")) return "Appearance and layout";
  if (pathname.startsWith("/app/search")) return "Find anything";
  if (pathname.startsWith("/app/us")) return "Shared space";
  return "Private workspace";
}
