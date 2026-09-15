"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./command-palette.module.css";

const destinations = [
  { href: "/app", icon: "⌂", label: "Mission Control", note: "Executive operating picture" },
  { href: "/app/messages?source=outlook", icon: "O", label: "Outlook", note: "Microsoft communications" },
  { href: "/app/messages?source=gmail", icon: "G", label: "Gmail", note: "Google communications" },
  { href: "/app/messages?source=texts", icon: "◉", label: "Texts", note: "Messaging source" },
  { href: "/app/calendar", icon: "◷", label: "Calendar", note: "Connected schedules" },
  { href: "/app/people", icon: "◎", label: "People", note: "Contacts and relationships" },
  { href: "/app/files", icon: "▣", label: "Files", note: "Private cloud storage" },
  { href: "/app/decisions", icon: "✓", label: "Decision Center", note: "Review and approve proposed actions" },
  { href: "/app/us", icon: "♡", label: "Us", note: "Shared workspace" },
  { href: "/app/settings/connections", icon: "↔", label: "Accounts", note: "Connections and sync health" },
  { href: "/app/settings", icon: "⚙", label: "Settings", note: "Appearance and profile" }
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setOpen(false);
    router.push(value ? `/app/search?q=${encodeURIComponent(value)}` : "/app/search");
  }

  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? destinations.filter(item => `${item.label} ${item.note}`.toLocaleLowerCase().includes(normalized))
    : destinations;

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title="Open command center">
        <span>Search / Go to</span><kbd>⌘K</kbd><span aria-hidden="true">⌕</span>
      </button>
      {open && (
        <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className={styles.palette} role="dialog" aria-modal="true" aria-label="Compass command center">
            <form id="compass-command-search" className={styles.searchRow} onSubmit={search}>
              <span className={styles.searchIcon}>⌕</span>
              <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Compass or jump somewhere…" aria-label="Command or search"/>
              <span className={styles.escape}>esc</span>
            </form>
            <div className={styles.body}>
              <div className={styles.label}>{normalized ? "Matching destinations" : "Go to"}</div>
              <div className={styles.grid}>
                {filtered.map(item => (
                  <Link className={styles.item} href={item.href} key={item.href} onClick={() => setOpen(false)}>
                    <span className={styles.itemIcon}>{item.icon}</span>
                    <span><b>{item.label}</b><small>{item.note}</small></span>
                    <span className={styles.arrow}>›</span>
                  </Link>
                ))}
                {!filtered.length && <button className={styles.item} type="submit" form="compass-command-search"><span className={styles.itemIcon}>⌕</span><span><b>Search Compass for “{query.trim()}”</b><small>Messages, calendar, people, files, tasks, and decisions</small></span><span className={styles.arrow}>↵</span></button>}
              </div>
            </div>
            <div className={styles.footer}><span>Type to filter destinations or press Enter to search all Compass data.</span><span>⌘K anywhere</span></div>
          </section>
        </div>
      )}
    </>
  );
}
