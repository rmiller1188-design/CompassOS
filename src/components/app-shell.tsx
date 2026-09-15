"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CommandPalette } from "@/components/command-palette";

const desktopNav = [
  { href: "/app", icon: "⌂", label: "Mission Control", exact: true },
  { href: "/app/messages", icon: "✉", label: "Communications" },
  { href: "/app/calendar", icon: "◷", label: "Calendar" },
  { href: "/app/people", icon: "◎", label: "People" },
  { href: "/app/files", icon: "▣", label: "Files" },
  { href: "/app/decisions", icon: "✓", label: "Decisions" },
  { href: "/app/us", icon: "♡", label: "Us" },
  { href: "/app/settings/connections", icon: "↔", label: "Accounts" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

const mobileNav = [
  { href: "/app", icon: "⌂", label: "Mission", exact: true },
  { href: "/app/messages", icon: "✉", label: "Comms" },
  { href: "/app/calendar", icon: "◷", label: "Calendar" },
  { href: "/app/decisions", icon: "✓", label: "Decide" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

type ThemeMode = "system" | "light" | "dark";
type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite";
type NavigationItem = { href: string; icon: string; label: string; exact?: boolean };

function applyAppearance(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.themeMode = mode;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = accent;
  localStorage.setItem("compass-theme-mode", mode);
  localStorage.setItem("compass-accent", accent);
}

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
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
        <Link href="/app" className="brand" aria-label="Open Mission Control"><span className="brand-mark small">C</span><span><b>CompassOS</b><small>Executive workspace</small></span></Link>
        <nav aria-label="Primary navigation">
          {desktopNav.map(item => {
            const active = isActive(pathname, item);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className="profile-chip" href="/app/settings" aria-label="Open profile and appearance settings"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span><b>{displayName}</b><small>Private profile · Settings</small></span></Link>
          <button className="text-button interactive-text-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button" onClick={goBack} aria-label="Back" title="Back">‹</button>
          <div className="top-title"><b>{pageTitle(pathname)}</b><small>{pageContext(pathname)}</small></div>
          <div className="top-actions"><CommandPalette/><Link className="icon-button" href="/app/settings" aria-label="Settings" title="Settings">⚙</Link></div>
        </header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNav.map(item => {
          const active = isActive(pathname, item);
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><span>{item.icon}</span>{item.label}</Link>;
        })}
      </nav>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/app/settings/connections")) return "Accounts";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/messages")) return "Communications";
  if (pathname.startsWith("/app/calendar")) return "Calendar";
  if (pathname.includes("/people/")) return "Contact";
  if (pathname.startsWith("/app/people")) return "People";
  if (pathname.startsWith("/app/decisions")) return "Decision Center";
  if (pathname.startsWith("/app/us")) return "Us";
  if (pathname.startsWith("/app/search")) return "Search";
  if (pathname.startsWith("/app/files")) return "Files";
  return "Mission Control";
}

function pageContext(pathname: string) {
  if (pathname.startsWith("/app/messages")) return "Outlook · Gmail · Texts";
  if (pathname.startsWith("/app/decisions")) return "Review before external action";
  if (pathname.startsWith("/app/settings/connections")) return "Provider health and permissions";
  if (pathname.startsWith("/app/search")) return "Private cross-Compass search";
  if (pathname.startsWith("/app/us")) return "Shared workspace";
  return "Private by default";
}
