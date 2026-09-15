"use client";

import { useEffect, useState } from "react";
import styles from "./appearance-settings.module.css";
import { defaultAppearance, type Accent, type AppearanceProfile, type Background, type Chrome, type Density, type Motion, type NavMode, type Radius, type Scale, type ThemeMode, type Surface } from "@/lib/personalization";

const themes: Array<{ id: ThemeMode; label: string; description: string; icon: string }> = [
  { id: "system", label: "System", description: "Follow this device", icon: "◐" },
  { id: "light", label: "Light", description: "Bright and clean", icon: "☀" },
  { id: "dark", label: "Dark", description: "Low-light workspace", icon: "☾" }
];
const accents: Array<{ id: Accent; label: string; color: string }> = [
  { id: "violet", label: "Violet", color: "#6e5cff" },
  { id: "blue", label: "Blue", color: "#3478f6" },
  { id: "cyan", label: "Cyan", color: "#0ea5b7" },
  { id: "green", label: "Green", color: "#28a66f" },
  { id: "gold", label: "Gold", color: "#c89222" },
  { id: "orange", label: "Orange", color: "#d77a24" },
  { id: "rose", label: "Rose", color: "#d95578" },
  { id: "red", label: "Red", color: "#d94b4b" },
  { id: "graphite", label: "Graphite", color: "#626977" }
];
const density: Array<{ id: Density; label: string; description: string }> = [
  { id: "compact", label: "Compact", description: "More information on screen" },
  { id: "comfortable", label: "Comfortable", description: "Balanced spacing" },
  { id: "spacious", label: "Spacious", description: "More breathing room" }
];
const radius: Array<{ id: Radius; label: string; description: string }> = [
  { id: "square", label: "Square", description: "Sharper product feel" },
  { id: "soft", label: "Soft", description: "Subtle rounded cards" },
  { id: "round", label: "Round", description: "Default Compass style" },
  { id: "pill", label: "Pill", description: "Highly rounded interface" }
];
const surface: Array<{ id: Surface; label: string; description: string }> = [
  { id: "solid", label: "Solid", description: "Flat, crisp panels" },
  { id: "glass", label: "Glass", description: "Layered translucent UI" },
  { id: "paper", label: "Paper", description: "Soft document feel" },
  { id: "midnight", label: "Midnight", description: "Darker, deeper panels" }
];
const motion: Array<{ id: Motion; label: string; description: string }> = [
  { id: "full", label: "Full", description: "Fluid transitions" },
  { id: "reduced", label: "Reduced", description: "Subtle motion" },
  { id: "none", label: "None", description: "No animation" }
];
const scale: Array<{ id: Scale; label: string; description: string }> = [
  { id: "small", label: "Small", description: "Dense text" },
  { id: "normal", label: "Normal", description: "Default size" },
  { id: "large", label: "Large", description: "Easier reading" }
];
const navMode: Array<{ id: NavMode; label: string; description: string }> = [
  { id: "expanded", label: "Expanded", description: "Full sidebar labels" },
  { id: "compact", label: "Compact", description: "Shorter sidebar" },
  { id: "icons", label: "Icons", description: "Minimal navigation" }
];
const chrome: Array<{ id: Chrome; label: string; description: string }> = [
  { id: "minimal", label: "Minimal", description: "Quiet controls" },
  { id: "balanced", label: "Balanced", description: "Polished but calm" },
  { id: "expressive", label: "Expressive", description: "More dimensional UI" }
];
const backgrounds: Array<{ id: Background; label: string; description: string }> = [
  { id: "calm", label: "Calm", description: "Neutral workspace" },
  { id: "gradient", label: "Gradient", description: "Premium color depth" },
  { id: "graphite", label: "Graphite", description: "Darker neutral shell" },
  { id: "warm", label: "Warm", description: "Softer tan base" },
  { id: "ocean", label: "Ocean", description: "Blue-green base" }
];

function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(profile: AppearanceProfile) {
  const root = document.documentElement;
  root.dataset.themeMode = profile.mode;
  root.dataset.theme = resolvedTheme(profile.mode);
  root.dataset.accent = profile.accent;
  root.dataset.density = profile.density;
  root.dataset.radius = profile.radius;
  root.dataset.surface = profile.surface;
  root.dataset.motion = profile.motion;
  root.dataset.scale = profile.scale;
  root.dataset.navMode = profile.navMode;
  root.dataset.chrome = profile.chrome;
  root.dataset.background = profile.background;
  localStorage.setItem("compass-appearance", JSON.stringify(profile));
}

export function AppearanceSettings({ initialAppearance }: { initialAppearance: AppearanceProfile }) {
  const [appearance, setAppearance] = useState<AppearanceProfile>(initialAppearance || defaultAppearance);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyAppearance(appearance);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => appearance.mode === "system" && applyAppearance(appearance);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);

  async function save(next: AppearanceProfile) {
    applyAppearance(next);
    setAppearance(next);
    setBusy(true);
    setStatus("Saving your personal workspace…");
    try {
      const response = await fetch("/api/settings/appearance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next)
      });
      if (!response.ok) throw new Error("save_failed");
      setStatus("Saved. Compass will keep this look with your profile.");
    } catch {
      setStatus("Applied on this device, but the profile save failed.");
    } finally {
      setBusy(false);
    }
  }

  function patch<T extends keyof AppearanceProfile>(key: T, value: AppearanceProfile[T]) {
    void save({ ...appearance, [key]: value });
  }

  return (
    <div className={styles.studio}>
      <section className={`${styles.hero} card`}>
        <div><p className="eyebrow">Appearance Studio</p><h2>Make Compass feel like yours.</h2><p>Control theme, accent, density, corner radius, surface material, motion, text scale, navigation shape, background, and page layout behavior. Changes apply immediately and save to your profile.</p></div>
        <button className={styles.reset} type="button" onClick={() => void save(defaultAppearance)}>Reset appearance</button>
      </section>

      <div className={styles.grid}>
        <ChoiceSection title="Theme" note="Choose the base color mode." value={appearance.mode} options={themes} onChange={value => patch("mode", value)}/>
        <section className={`${styles.section} card`}>
          <div className={styles.sectionHeader}><div><p className="eyebrow">Color</p><h3>Accent</h3><p>Used for buttons, selected rows, focus states, and highlights.</p></div><span className="pill">{appearance.accent}</span></div>
          <div className={styles.swatchGrid}>{accents.map(option => <button type="button" key={option.id} className={`${styles.swatch}${appearance.accent === option.id ? ` ${styles.selected}` : ""}`} onClick={() => patch("accent", option.id)}><span className={styles.dot} style={{ background: option.color }}/><span>{option.label}</span></button>)}</div>
        </section>
        <ChoiceSection title="Density" note="Control how much the interface breathes." value={appearance.density} options={density} onChange={value => patch("density", value)}/>
        <ChoiceSection title="Corners" note="Change the shape of cards, modals, and controls." value={appearance.radius} options={radius} onChange={value => patch("radius", value)}/>
        <ChoiceSection title="Surface" note="Choose flat, glass, paper, or deep-panel material." value={appearance.surface} options={surface} onChange={value => patch("surface", value)}/>
        <ChoiceSection title="Motion" note="Tune or disable transitions." value={appearance.motion} options={motion} onChange={value => patch("motion", value)}/>
        <ChoiceSection title="Text scale" note="Make the workspace denser or easier to read." value={appearance.scale} options={scale} onChange={value => patch("scale", value)}/>
        <ChoiceSection title="Navigation" note="Use full labels, compact labels, or icon-first mode." value={appearance.navMode} options={navMode} onChange={value => patch("navMode", value)}/>
        <ChoiceSection title="Interface chrome" note="Decide how prominent borders, shadows, and effects feel." value={appearance.chrome} options={chrome} onChange={value => patch("chrome", value)}/>
        <ChoiceSection title="Background" note="Set the overall workspace atmosphere." value={appearance.background} options={backgrounds} onChange={value => patch("background", value)}/>
      </div>

      <section className={`${styles.preview} card`}>
        <div><p className="eyebrow">Preview</p><h2>Live interface preview</h2><p className="muted">This uses the same CSS variables as the app shell, so the preview mirrors the real product surface.</p></div>
        <div className={styles.previewWindow} aria-label="Appearance preview"><div className={styles.previewNav}><i/><i/><i/><i/></div><div className={styles.previewContent}><div className={styles.previewCard}><b/><i/><i/><span className={styles.previewButton}>Primary action</span></div><div className={styles.previewCard}><b/><i/></div></div></div>
      </section>
      {status && <p className={styles.status} role="status">{busy ? "Saving… " : ""}{status}</p>}
    </div>
  );
}

function ChoiceSection<T extends string>({ title, note, value, options, onChange }: { title: string; note: string; value: T; options: Array<{ id: T; label: string; description: string; icon?: string }>; onChange: (value: T) => void }) {
  return (
    <section className={`${styles.section} card`}>
      <div className={styles.sectionHeader}><div><p className="eyebrow">Customize</p><h3>{title}</h3><p>{note}</p></div><span className="pill">{value}</span></div>
      <div className={`${styles.options} ${options.length === 3 ? styles.three : ""}`}>{options.map(option => <button type="button" key={option.id} className={`${styles.option}${value === option.id ? ` ${styles.selected}` : ""}`} onClick={() => onChange(option.id)} aria-pressed={value === option.id}><b>{option.icon ? `${option.icon} ` : ""}{option.label}</b><small>{option.description}</small></button>)}</div>
    </section>
  );
}

export type { ThemeMode, Accent, AppearanceProfile };
