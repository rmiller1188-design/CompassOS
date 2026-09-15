export type ThemeMode = "system" | "light" | "dark";
export type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite" | "cyan" | "red" | "gold";
export type Density = "compact" | "comfortable" | "spacious";
export type Radius = "square" | "soft" | "round" | "pill";
export type Surface = "solid" | "glass" | "paper" | "midnight";
export type Motion = "full" | "reduced" | "none";
export type Scale = "small" | "normal" | "large";
export type NavMode = "expanded" | "compact" | "icons";
export type Chrome = "minimal" | "balanced" | "expressive";
export type Background = "calm" | "gradient" | "graphite" | "warm" | "ocean";
export type CardSize = "auto" | "compact" | "wide" | "full";

export type AppearanceProfile = {
  mode: ThemeMode;
  accent: Accent;
  density: Density;
  radius: Radius;
  surface: Surface;
  motion: Motion;
  scale: Scale;
  navMode: NavMode;
  chrome: Chrome;
  background: Background;
};

export type LayoutRule = { order?: number; size?: CardSize; hidden?: boolean };
export type LayoutSettings = Record<string, Record<string, LayoutRule>>;

export const defaultAppearance: AppearanceProfile = {
  mode: "system",
  accent: "violet",
  density: "comfortable",
  radius: "round",
  surface: "glass",
  motion: "full",
  scale: "normal",
  navMode: "expanded",
  chrome: "balanced",
  background: "calm"
};

const allowed = {
  mode: new Set(["system", "light", "dark"]),
  accent: new Set(["violet", "blue", "green", "orange", "rose", "graphite", "cyan", "red", "gold"]),
  density: new Set(["compact", "comfortable", "spacious"]),
  radius: new Set(["square", "soft", "round", "pill"]),
  surface: new Set(["solid", "glass", "paper", "midnight"]),
  motion: new Set(["full", "reduced", "none"]),
  scale: new Set(["small", "normal", "large"]),
  navMode: new Set(["expanded", "compact", "icons"]),
  chrome: new Set(["minimal", "balanced", "expressive"]),
  background: new Set(["calm", "gradient", "graphite", "warm", "ocean"]),
  size: new Set(["auto", "compact", "wide", "full"])
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function enumValue<T extends string>(value: unknown, values: Set<string>, fallback: T): T {
  return typeof value === "string" && values.has(value) ? value as T : fallback;
}

export function settingsRecord(value: unknown): Record<string, unknown> {
  return record(value);
}

export function normalizeAppearance(value: unknown): AppearanceProfile {
  const input = record(value);
  return {
    mode: enumValue(input.mode, allowed.mode, defaultAppearance.mode),
    accent: enumValue(input.accent, allowed.accent, defaultAppearance.accent),
    density: enumValue(input.density, allowed.density, defaultAppearance.density),
    radius: enumValue(input.radius, allowed.radius, defaultAppearance.radius),
    surface: enumValue(input.surface, allowed.surface, defaultAppearance.surface),
    motion: enumValue(input.motion, allowed.motion, defaultAppearance.motion),
    scale: enumValue(input.scale, allowed.scale, defaultAppearance.scale),
    navMode: enumValue(input.navMode, allowed.navMode, defaultAppearance.navMode),
    chrome: enumValue(input.chrome, allowed.chrome, defaultAppearance.chrome),
    background: enumValue(input.background, allowed.background, defaultAppearance.background)
  };
}

export function normalizeLayout(value: unknown): LayoutSettings {
  const input = record(value);
  const output: LayoutSettings = {};
  for (const [page, rawRules] of Object.entries(input)) {
    const ruleInput = record(rawRules);
    const rules: Record<string, LayoutRule> = {};
    for (const [card, rawRule] of Object.entries(ruleInput)) {
      const row = record(rawRule);
      const rule: LayoutRule = {};
      if (typeof row.order === "number" && Number.isFinite(row.order)) rule.order = Math.trunc(row.order);
      if (typeof row.hidden === "boolean") rule.hidden = row.hidden;
      if (typeof row.size === "string" && allowed.size.has(row.size)) rule.size = row.size as CardSize;
      if (Object.keys(rule).length) rules[card] = rule;
    }
    if (Object.keys(rules).length) output[page] = rules;
  }
  return output;
}
