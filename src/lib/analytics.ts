const VISITOR_KEY = "cineweb-visitor-id";

export type AnalyticsEventType =
  | "session_start"
  | "search"
  | "node_click"
  | "share_click"
  | "session_end";

type EventMetadata = Record<string, string | number | boolean | null | undefined>;

let sessionId: string | null = null;
let sessionStartedAt = 0;
let maxDepth = 0;
let ended = false;

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function supabaseUrl(): string | undefined {
  const raw = env("VITE_SUPABASE_URL");
  if (!raw) return undefined;
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function supabaseKey(): string | undefined {
  return env("VITE_SUPABASE_ANON_KEY");
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function insertPayload(eventType: AnalyticsEventType, metadata?: EventMetadata) {
  if (!sessionId) return null;
  return {
    visitor_id: getVisitorId(),
    session_id: sessionId,
    event_type: eventType,
    metadata: metadata ?? null,
  };
}

/** Publishable keys (sb_publishable_...) must use apikey header only — not Authorization Bearer. */
async function insertEvent(eventType: AnalyticsEventType, metadata?: EventMetadata) {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key || !sessionId) return;

  const row = insertPayload(eventType, metadata);
  if (!row) return;

  try {
    const res = await fetch(`${url}/rest/v1/cineweb_events`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      keepalive: eventType === "session_end",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[cineweb analytics]", eventType, res.status, text.slice(0, 120));
    }
  } catch (err) {
    console.warn("[cineweb analytics]", eventType, err);
  }
}

function endSession() {
  if (!sessionId || ended) return;
  ended = true;

  void insertEvent("session_end", {
    total_depth: maxDepth,
    duration_seconds: Math.round((Date.now() - sessionStartedAt) / 1000),
  });

  sessionId = null;
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") endSession();
}

export function initAnalytics() {
  if (sessionId) return;
  if (!isAnalyticsConfigured()) {
    if (import.meta.env.DEV) {
      console.info("[cineweb analytics] disabled — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    }
    return;
  }

  sessionId = crypto.randomUUID();
  sessionStartedAt = Date.now();
  ended = false;
  maxDepth = 0;

  const ref = new URLSearchParams(window.location.search).get("ref");

  void insertEvent("session_start", { referrer: document.referrer || null, ref });

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", endSession);
}

export function trackSearch(query: string, resultType: "movie" | "person") {
  void insertEvent("search", { query, result_type: resultType });
}

export function trackNodeClick(nodeType: "movie" | "person", depth: number, tmdbId: number) {
  maxDepth = Math.max(maxDepth, depth);
  void insertEvent("node_click", { node_type: nodeType, depth, tmdb_id: tmdbId });
}

export function trackShareClick(depth: number) {
  void insertEvent("share_click", { depth });
}

export function analyticsEnabled(): boolean {
  return isAnalyticsConfigured();
}
