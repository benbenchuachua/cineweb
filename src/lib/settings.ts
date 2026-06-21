import type { Theme } from "./theme";
import type { ViewMode } from "./layout";

export type { ViewMode };

const SETTINGS_KEY = "cineweb-settings";
const LEGACY_THEME_KEY = "cineweb-theme";

export interface AppSettings {
  theme: Theme;
  /** Pan/orbit multiplier — 1 = default */
  scrollSpeed: number;
  /** Zoom multiplier — 1 = default */
  zoomSpeed: number;
  /** Flat 2D diagram vs perspective 3D orbit */
  viewMode: ViewMode;
}

export const SCROLL_SPEED_MIN = 0.25;
export const SCROLL_SPEED_MAX = 8;
export const SCROLL_SPEED_DEFAULT = 1;

export const ZOOM_SPEED_MIN = 0.25;
export const ZOOM_SPEED_MAX = 10;
export const ZOOM_SPEED_DEFAULT = 1;

export const VIEW_MODE_DEFAULT: ViewMode = "3d";

const DEFAULTS: AppSettings = {
  theme: "dark",
  scrollSpeed: SCROLL_SPEED_DEFAULT,
  zoomSpeed: ZOOM_SPEED_DEFAULT,
  viewMode: VIEW_MODE_DEFAULT,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        theme: parsed.theme === "light" ? "light" : "dark",
        scrollSpeed: clampScrollSpeed(parsed.scrollSpeed ?? SCROLL_SPEED_DEFAULT),
        zoomSpeed: clampZoomSpeed(parsed.zoomSpeed ?? parsed.scrollSpeed ?? ZOOM_SPEED_DEFAULT),
        viewMode: parsed.viewMode === "2d" ? "2d" : "3d",
      };
    }
  } catch {
    /* ignore */
  }

  const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
  return {
    ...DEFAULTS,
    theme: legacyTheme === "light" ? "light" : "dark",
  };
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localStorage.setItem(LEGACY_THEME_KEY, settings.theme);
}

export function clampScrollSpeed(value: number): number {
  return Math.max(SCROLL_SPEED_MIN, Math.min(SCROLL_SPEED_MAX, value));
}

export function clampZoomSpeed(value: number): number {
  return Math.max(ZOOM_SPEED_MIN, Math.min(ZOOM_SPEED_MAX, value));
}

export function speedLabel(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.12) return "Very slow";
  if (ratio < 0.25) return "Slow";
  if (ratio < 0.45) return "Normal";
  if (ratio < 0.7) return "Fast";
  if (ratio < 0.9) return "Very fast";
  return "Max";
}
