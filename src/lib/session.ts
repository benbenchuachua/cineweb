import { parsePath } from "./api";

const SESSION_PATH_KEY = "cineweb-session-path";

export function getSavedPathRaw(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("path");
    if (fromUrl && parsePath(fromUrl).length > 0) return fromUrl;
    const fromSession = sessionStorage.getItem(SESSION_PATH_KEY);
    if (fromSession && parsePath(fromSession).length > 0) return fromSession;
  } catch {
    /* ignore */
  }
  return null;
}

export function shouldRestoreSession(): boolean {
  return getSavedPathRaw() !== null;
}

export function saveSessionPath(encoded: string) {
  try {
    sessionStorage.setItem(SESSION_PATH_KEY, encoded);
  } catch {
    /* ignore */
  }
}

export function clearSessionPath() {
  try {
    sessionStorage.removeItem(SESSION_PATH_KEY);
  } catch {
    /* ignore */
  }
}

export function clearRestoringHtml() {
  delete document.documentElement.dataset.restoring;
}
