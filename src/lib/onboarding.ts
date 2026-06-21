const TOP_HINT_KEY = "cineweb-top-hint-seen";

export function hasSeenTopHint(): boolean {
  try {
    return localStorage.getItem(TOP_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTopHintSeen() {
  try {
    localStorage.setItem(TOP_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}
