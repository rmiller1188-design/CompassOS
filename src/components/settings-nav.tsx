import Link from "next/link";

export function SettingsNav({ active }: { active: "appearance" | "connections" }) {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      <Link className={active === "appearance" ? "active" : ""} href="/app/settings">
        <span>◐</span>
        <span><b>Appearance</b><small>Theme and accent</small></span>
      </Link>
      <Link className={active === "connections" ? "active" : ""} href="/app/settings/connections">
        <span>◎</span>
        <span><b>Connections</b><small>Google and Microsoft</small></span>
      </Link>
    </nav>
  );
}
