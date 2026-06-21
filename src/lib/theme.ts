export type Theme = "dark" | "light";

const STORAGE_KEY = "cineweb-theme";

export function loadTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export interface SceneTheme {
  background: number;
  fog: number;
  fogDensity: number;
  edgeColor: number;
  edgeOpacity: number;
  ambient: number;
  ambientIntensity: number;
  keyLight: number;
  keyIntensity: number;
  rimLight: number;
  rimIntensity: number;
  backdropTop: number;
  backdropBottom: number;
  borderOuter: string;
  borderInner: string;
  placeholderMovie: string;
  placeholderPerson: string;
}

export const SCENE_THEMES: Record<Theme, SceneTheme> = {
  dark: {
    background: 0x050a14,
    fog: 0x050a14,
    fogDensity: 0.025,
    edgeColor: 0x3a6aa8,
    edgeOpacity: 0.45,
    ambient: 0xdde8ff,
    ambientIntensity: 0.35,
    keyLight: 0xc8dcff,
    keyIntensity: 0.9,
    rimLight: 0x4488dd,
    rimIntensity: 0.55,
    backdropTop: 0x0a1830,
    backdropBottom: 0x030810,
    borderOuter: "rgba(0, 0, 0, 0.88)",
    borderInner: "rgba(20, 40, 72, 0.75)",
    placeholderMovie: "#142238",
    placeholderPerson: "#0c1828",
  },
  light: {
    background: 0xebf1f9,
    fog: 0xebf1f9,
    fogDensity: 0.018,
    edgeColor: 0x4a72b0,
    edgeOpacity: 0.35,
    ambient: 0xffffff,
    ambientIntensity: 0.65,
    keyLight: 0xf5f8fc,
    keyIntensity: 1.1,
    rimLight: 0x5088cc,
    rimIntensity: 0.35,
    backdropTop: 0xdce6f5,
    backdropBottom: 0xebf1f9,
    borderOuter: "rgba(12, 24, 48, 0.82)",
    borderInner: "rgba(40, 72, 120, 0.5)",
    placeholderMovie: "#a8c0e0",
    placeholderPerson: "#98b4d4",
  },
};

let activeTheme: Theme = "dark";
let activeSceneTheme = SCENE_THEMES.dark;

export function setActiveTheme(theme: Theme) {
  activeTheme = theme;
  activeSceneTheme = SCENE_THEMES[theme];
}

export function getActiveSceneTheme() {
  return activeSceneTheme;
}

export function getActiveTheme() {
  return activeTheme;
}
