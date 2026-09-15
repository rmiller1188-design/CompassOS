import Link from "next/link";

export function SettingsNav({ active }: { active: "appearance" | "connections" }) {
  return (
    <nav className="settings-nav" aria-label="Settings sections" data-no-layout-edit>
      <Link className={active === "appearance" ? "active" : ""} href="/app/settings">
        <span>✣</span>
        <span><b>Personal studio</b><small>Appearance and layouts</small></span>
      </Link>
      <Link className={active === "connections" ? "active" : ""} href="/app/settings/connections">
        <span>↔</span>
        <span><b>Connections</b><small>Accounts and permissions</small></span>
      </Link>
    </nav>
  );
}
