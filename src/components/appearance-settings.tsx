"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";
type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite";

const themes: Array<{ id: ThemeMode; label: string; description: string; icon: string }> = [
  { id: "system", label: "System", description: "Match this device", icon: "◐" },
  { id: "light", label: "Light", description: "Bright interface", icon: "☀" },
  { id: "dark", label: "Dark", description: "Low-light interface", icon: "☾" }
];

const accents: Array<{ id: Accent; label: string; color: string }> = [
  { id: "violet", label: "Violet", color: "#6e5cff" },
  { id: "blue", label: "Blue", color: "#3478f6" },
  { id: "green", label: "Green", color: "#28a66f" },
  { id: "orange", label: "Orange", color: "#d77a24" },
  { id: "rose", label: "Rose", color: "#d95578" },
  { id: "graphite", label: "Graphite", color: "#626977" }
];

function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAppearance(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolvedTheme(mode);
  root.dataset.accent = accent;
  localStorage.setItem("compass-theme-mode", mode);
  localStorage.setItem("compass-accent", accent);
}

export function AppearanceSettings({ initialMode, initialAccent }: { initialMode: ThemeMode; initialAccent: Accent }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [accent, setAccent] = useState<Accent>(initialAccent);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyAppearance(mode, accent);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => mode === "system" && applyAppearance(mode, accent);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode, accent]);

  async function save(nextMode: ThemeMode, nextAccent: Accent) {
    applyAppearance(nextMode, nextAccent);
    setBusy(true);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/settings/appearance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode, accent: nextAccent })
      });
      if (!response.ok) throw new Error("save_failed");
      setStatus("Saved to your Compass profile.");
    } catch {
      setStatus("Applied on this device, but the profile save failed.");
    } finally {
      setBusy(false);
    }
  }

  function selectMode(next: ThemeMode) {
    setMode(next);
    void save(next, accent);
  }

  function selectAccent(next: Accent) {
    setAccent(next);
    void save(mode, next);
  }

  return (
    <div className="appearance-stack">
      <section className="card appearance-section">
        <div className="section-heading">
          <div><p className="eyebrow">Display</p><h2>Theme</h2></div>
          <span className="pill">{busy ? "Saving" : "Synced"}</span>
        </div>
        <p className="muted">Choose how Compass looks on this device. System follows the device appearance automatically.</p>
        <div className="theme-options">
          {themes.map(option => (
            <button
              type="button"
              key={option.id}
              className={`theme-option${mode === option.id ? " selected" : ""}`}
              onClick={() => selectMode(option.id)}
              aria-pressed={mode === option.id}
            >
              <span className="theme-preview"><i>{option.icon}</i><em/><em/><em/></span>
              <span><b>{option.label}</b><small>{option.description}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="card appearance-section">
        <p className="eyebrow">Personalization</p>
        <h2>Accent color</h2>
        <p className="muted">The accent is used for navigation, buttons, selected rows, indicators, and highlights.</p>
        <div className="accent-options">
          {accents.map(option => (
            <button
              type="button"
              key={option.id}
              className={`accent-option${accent === option.id ? " selected" : ""}`}
              onClick={() => selectAccent(option.id)}
              aria-pressed={accent === option.id}
            >
              <span className="accent-swatch" style={{ background: option.color }}/>
              <span>{option.label}</span>
              <b>{accent === option.id ? "✓" : ""}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="card appearance-preview">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>Compass interface</h2>
          <p className="muted">Changes apply immediately and follow your profile on supported Compass devices.</p>
        </div>
        <div className="preview-window">
          <span className="preview-sidebar"><i/><i/><i/></span>
          <span className="preview-content"><b/><i/><i/><button type="button" tabIndex={-1}>Action</button></span>
        </div>
      </section>

      {status && <p className="appearance-status" role="status">{status}</p>}
    </div>
  );
}

export type { ThemeMode, Accent };
