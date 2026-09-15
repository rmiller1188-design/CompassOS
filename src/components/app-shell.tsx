"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CommandPalette } from "@/components/command-palette";
import { applyAppearance } from "@/components/appearance-settings";
import type { AppearanceProfile, LayoutSettings } from "@/lib/personalization";

const desktopNav = [
  { href: "/app", icon: "⌂", label: "Home", exact: true },
  { href: "/app/messages", icon: "✉", label: "Messages" },
  { href: "/app/calendar", icon: "◷", label: "Calendar" },
  { href: "/app/people", icon: "◎", label: "People" },
  { href: "/app/photos", icon: "▧", label: "Photos" },
  { href: "/app/files", icon: "▣", label: "Files" },
  { href: "/app/us", icon: "♡", label: "Us" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

const mobileNav = [
  { href: "/app", icon: "⌂", label: "Home", exact: true },
  { href: "/app/messages", icon: "✉", label: "Messages" },
  { href: "/app/photos", icon: "▧", label: "Photos" },
  { href: "/app/us", icon: "♡", label: "Us" },
  { href: "/app/search", icon: "⌕", label: "Search" }
] as const;

type NavigationItem = { href: string; icon: string; label: string; exact?: boolean };
function isActive(pathname: string, item: NavigationItem) { return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`); }

export function AppShell({ children, displayName, initialAppearance }: { children: React.ReactNode; displayName: string; initialAppearance: AppearanceProfile; initialLayout: LayoutSettings }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  useEffect(() => { applyAppearance(initialAppearance); }, [initialAppearance]);
  function goBack() { if (window.history.length > 1) router.back(); else router.push("/app"); }
  async function signOut() { await supabase.auth.signOut(); router.replace("/sign-in"); router.refresh(); }
  return <div className="app-shell">
    <aside className="sidebar" data-no-layout-edit>
      <Link href="/app" className="brand" aria-label="Open Home"><span className="brand-mark small">C</span><span><b>Compass</b><small>Home together</small></span></Link>
      <nav aria-label="Primary navigation">{desktopNav.map(item => { const active=isActive(pathname,item); return <Link key={item.href} href={item.href} className={active?"active":""}><span>{item.icon}</span>{item.label}</Link>; })}</nav>
      <div className="sidebar-bottom"><Link className="profile-chip" href="/app/settings"><span className="avatar">{displayName.slice(0,1).toUpperCase()}</span><span><b>{displayName}</b><small>Settings</small></span></Link><button className="text-button interactive-text-button" onClick={() => void signOut()}>Sign out</button></div>
    </aside>
    <div className="app-main"><header className="topbar" data-no-layout-edit><button className="icon-button" onClick={goBack} aria-label="Back">‹</button><div className="top-title"><b>{pageTitle(pathname)}</b></div><div className="top-actions"><CommandPalette/><Link className="icon-button" href="/app/settings" aria-label="Settings">⚙</Link></div></header><main className="page-content">{children}</main></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{mobileNav.map(item => { const active=isActive(pathname,item); return <Link key={item.href} href={item.href} className={active?"active":""}><span>{item.icon}</span>{item.label}</Link>; })}</nav>
  </div>;
}

function pageTitle(pathname:string){
  if(pathname.startsWith("/app/settings")) return "Settings";
  if(pathname.startsWith("/app/messages")) return "Messages";
  if(pathname.startsWith("/app/calendar")) return "Calendar";
  if(pathname.startsWith("/app/people")) return "People";
  if(pathname.startsWith("/app/photos")) return "Photos";
  if(pathname.startsWith("/app/files")) return "Files";
  if(pathname.startsWith("/app/us")) return "Us";
  if(pathname.startsWith("/app/search")) return "Search";
  return "Home";
}
