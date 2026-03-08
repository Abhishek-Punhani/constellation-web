import { writable } from "svelte/store";

export type AccentPreset = "violet" | "cyan" | "emerald" | "rose" | "amber";

export interface UISettings {
  showToasts: boolean;
  toastDuration: number; // ms 1000–10000
  toastOnSuccess: boolean;
  toastOnFailure: boolean;
  simSpeedMultiplier: number; // 0.25 | 0.5 | 1 | 2 | 4
  wsUrl: string;
  logMaxEntries: number; // 100–5000
  accentPreset: AccentPreset;
}

export const ACCENT_COLORS: Record<
  AccentPreset,
  { color: string; dim: string; glow: string }
> = {
  violet: {
    color: "#7c6af7",
    dim: "#5b4dcf",
    glow: "rgba(124,106,247,0.15)",
  },
  cyan: {
    color: "#06b6d4",
    dim: "#0891b2",
    glow: "rgba(6,182,212,0.15)",
  },
  emerald: {
    color: "#10b981",
    dim: "#059669",
    glow: "rgba(16,185,129,0.15)",
  },
  rose: {
    color: "#f43f5e",
    dim: "#e11d48",
    glow: "rgba(244,63,94,0.15)",
  },
  amber: {
    color: "#f59e0b",
    dim: "#d97706",
    glow: "rgba(245,158,11,0.15)",
  },
};

const DEFAULTS: UISettings = {
  showToasts: true,
  toastDuration: 3500,
  toastOnSuccess: true,
  toastOnFailure: true,
  simSpeedMultiplier: 1,
  wsUrl: "ws://localhost:8080",
  logMaxEntries: 1000,
  accentPreset: "violet",
};

const STORAGE_KEY = "constellation-ui-settings";

function load(): UISettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function persist(s: UISettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function createSettingsStore() {
  const { subscribe, update, set } = writable<UISettings>(load());

  return {
    subscribe,
    patch(partial: Partial<UISettings>) {
      update((s) => {
        const next = { ...s, ...partial };
        persist(next);
        return next;
      });
    },
    reset() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      set({ ...DEFAULTS });
    },
  };
}

export const uiSettings = createSettingsStore();

/** Apply accent preset to CSS custom properties on :root */
export function applyAccent(preset: AccentPreset) {
  const c = ACCENT_COLORS[preset];
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--color-accent", c.color);
  document.documentElement.style.setProperty("--color-accent-dim", c.dim);
  document.documentElement.style.setProperty("--color-accent-glow", c.glow);
}
