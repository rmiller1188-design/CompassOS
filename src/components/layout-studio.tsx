"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./layout-studio.module.css";
import type { CardSize, LayoutRule, LayoutSettings } from "@/lib/personalization";

type CardRecord = { id: string; label: string; index: number };
const sizes: CardSize[] = ["auto", "compact", "wide", "full"];

function labelFor(element: HTMLElement, index: number): string {
  const heading = element.querySelector("h1,h2,h3,.section-heading b,b")?.textContent?.replace(/\s+/g, " ").trim();
  return heading || `Section ${index + 1}`;
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 46) || "section"; }
function gridColumn(size: CardSize | undefined): string {
  if (size === "compact") return "span 4 / span 4";
  if (size === "wide") return "span 8 / span 8";
  if (size === "full") return "1 / -1";
  return "";
}
function cleanLayout(layout: LayoutSettings): LayoutSettings {
  const cleaned: LayoutSettings = {};
  for (const [page, rules] of Object.entries(layout)) {
    const nextRules: Record<string, LayoutRule> = {};
    for (const [id, rule] of Object.entries(rules)) {
      const next: LayoutRule = {};
      if (typeof rule.order === "number") next.order = rule.order;
      if (rule.size && rule.size !== "auto") next.size = rule.size;
      if (rule.hidden) next.hidden = true;
      if (Object.keys(next).length) nextRules[id] = next;
    }
    if (Object.keys(nextRules).length) cleaned[page] = nextRules;
  }
  return cleaned;
}

export function LayoutStudio({ initialLayout }: { initialLayout: LayoutSettings }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [layout, setLayout] = useState<LayoutSettings>(initialLayout || {});
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const collect = useCallback(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("main.page-content .card:not([data-no-layout-edit])"));
    const map = new Map<string, HTMLElement>();
    const records = nodes.map((element, index) => {
      const label = labelFor(element, index);
      const explicit = element.getAttribute("data-layout-id");
      const id = explicit || `${pathname}:${index}:${slug(label)}`;
      element.dataset.compassLayoutId = id;
      map.set(id, element);
      return { id, label, index };
    });
    elements.current = map;
    setCards(records);
  }, [pathname]);

  const pageRules = layout[pathname] || {};
  const orderedCards = useMemo(() => [...cards].sort((a, b) => (pageRules[a.id]?.order ?? a.index) - (pageRules[b.id]?.order ?? b.index)), [cards, pageRules]);

  const apply = useCallback(() => {
    const rules = layoutRef.current[pathname] || {};
    for (const card of cards) {
      const element = elements.current.get(card.id);
      if (!element) continue;
      const rule = rules[card.id] || {};
      element.style.display = rule.hidden ? "none" : "";
      element.style.order = typeof rule.order === "number" ? String(rule.order) : "";
      element.style.gridColumn = gridColumn(rule.size);
      element.dataset.layoutSize = rule.size || "auto";
      element.dataset.layoutHidden = rule.hidden ? "true" : "false";
    }
  }, [cards, pathname]);

  useEffect(() => { const timer = window.setTimeout(collect, 40); return () => window.clearTimeout(timer); }, [collect, pathname]);
  useEffect(() => { apply(); }, [apply, layout, cards]);
  useEffect(() => {
    document.documentElement.dataset.layoutEdit = open ? "true" : "false";
    return () => { delete document.documentElement.dataset.layoutEdit; };
  }, [open]);

  async function persist(next: LayoutSettings) {
    const cleaned = cleanLayout(next);
    setLayout(cleaned);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/settings/layout", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ layout: cleaned }) });
      if (!response.ok) throw new Error("layout_save_failed");
      setStatus("Saved");
    } catch { setStatus("Saved on this device; profile sync needs attention."); }
  }

  function updateCard(id: string, patch: LayoutRule) {
    const currentPage = layout[pathname] || {};
    void persist({ ...layout, [pathname]: { ...currentPage, [id]: { ...(currentPage[id] || {}), ...patch } } });
  }

  function reorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const visible = orderedCards.filter(card => !pageRules[card.id]?.hidden);
    const from = visible.findIndex(card => card.id === sourceId);
    const to = visible.findIndex(card => card.id === targetId);
    if (from < 0 || to < 0) return;
    const nextOrder = [...visible];
    const [moved] = nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, moved);
    const nextPage = { ...pageRules };
    nextOrder.forEach((card, order) => { nextPage[card.id] = { ...(nextPage[card.id] || {}), order }; });
    void persist({ ...layout, [pathname]: nextPage });
  }

  function move(id: string, direction: -1 | 1) {
    const visible = orderedCards.filter(card => !pageRules[card.id]?.hidden);
    const index = visible.findIndex(card => card.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= visible.length) return;
    reorder(id, visible[target].id);
  }

  function resetPage() {
    const next = { ...layout };
    delete next[pathname];
    for (const element of elements.current.values()) { element.style.display = ""; element.style.order = ""; element.style.gridColumn = ""; }
    void persist(next);
  }

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => { collect(); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open} title="Customize this page"><span>Customize</span><span aria-hidden="true">✣</span></button>
      {open && (
        <aside className={styles.panel} role="dialog" aria-modal="false" aria-label="Page layout editor">
          <div className={styles.header}>
            <div><span className={styles.badge}>This page</span><h2>Edit layout</h2><p>Drag sections into your preferred order, change their width, or remove them from this view. Removed sections can always be restored.</p></div>
            <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="Close layout editor">×</button>
          </div>
          <div className={styles.toolbar}><button className={styles.mini} type="button" onClick={collect}>Refresh</button><button className={styles.mini} type="button" onClick={resetPage}>Reset page</button></div>
          <div className={styles.cardList}>
            {orderedCards.length ? orderedCards.map(card => {
              const rule = pageRules[card.id] || {};
              return (
                <div className={`${styles.row}${rule.hidden ? ` ${styles.hidden}` : ""}`} key={card.id} draggable={!rule.hidden}
                  onDragStart={() => setDragging(card.id)} onDragEnd={() => setDragging(null)}
                  onDragOver={event => { if (!rule.hidden) event.preventDefault(); }}
                  onDrop={event => { event.preventDefault(); if (dragging) reorder(dragging, card.id); setDragging(null); }}>
                  <div className={styles.rowTop}><span><b>{rule.hidden ? "○" : "⠿"} {card.label}</b><small>{rule.hidden ? "Removed from page" : `Width: ${rule.size || "auto"} · drag to reorder`}</small></span><span className={styles.badge}>{rule.hidden ? "Off" : "On"}</span></div>
                  <div className={styles.actions}>
                    {!rule.hidden && <><button type="button" onClick={() => move(card.id, -1)} aria-label={`Move ${card.label} up`}>↑</button><button type="button" onClick={() => move(card.id, 1)} aria-label={`Move ${card.label} down`}>↓</button></>}
                    {!rule.hidden && sizes.map(size => <button key={size} type="button" className={(rule.size || "auto") === size ? styles.active : ""} onClick={() => updateCard(card.id, { size })}>{size === "auto" ? "Auto" : size === "compact" ? "S" : size === "wide" ? "L" : "Full"}</button>)}
                    <button type="button" onClick={() => updateCard(card.id, { hidden: !rule.hidden })}>{rule.hidden ? "Restore" : "Remove"}</button>
                  </div>
                </div>
              );
            }) : <div className={styles.empty}>This page has no editable sections yet.</div>}
          </div>
          {status && <p className={styles.status} role="status">{status}</p>}
        </aside>
      )}
      {open && <div className={styles.modeTag}>Editing this page</div>}
    </>
  );
}
