import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const VISITOR_KEY = "cineweb-visitor-id";

export type AnalyticsEventType =
  | "session_start"
  | "search"
  | "node_click"
  | "share_click"
  | "session_end";

type EventMetadata = Record<string, string | number | boolean | null | undefined>;

let supabase: SupabaseClient | null = null;
let sessionId: string | null = null;
let sessionStartedAt = 0;
let maxDepth = 0;
let ended = false;

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isConfigured(): boolean {
  return Boolean(env("VITE_SUPABASE_URL") && env("VITE_SUPABASE_ANON_KEY"));
}

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = env("VITE_SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY");
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
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

async function insertEvent(eventType: AnalyticsEventType, metadata?: EventMetadata) {
  if (!isConfigured() || !sessionId) return;

  const row = insertPayload(eventType, metadata);
  if (!row) return;

  const client = getSupabase();
  if (!client) return;

  const { error } = await client.from("cineweb_events").insert(row);
  if (error) {
    console.debug("[cineweb analytics]", error.message);
  }
}

function insertEventBeacon(eventType: AnalyticsEventType, metadata?: EventMetadata) {
  if (!isConfigured() || !sessionId) return;

  const url = env("VITE_SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY");
  const row = insertPayload(eventType, metadata);
  if (!url || !key || !row) return;

  void fetch(`${url}/rest/v1/cineweb_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
    keepalive: true,
  }).catch(() => {});
}

function endSession() {
  if (!sessionId || ended) return;
  ended = true;

  insertEventBeacon("session_end", {
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
  if (!isConfigured()) return;

  sessionId = crypto.randomUUID();
  sessionStartedAt = Date.now();
  ended = false;
  maxDepth = 0;

  const ref = new URLSearchParams(window.location.search).get("ref");

  void insertEvent("session_start", { ref });

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
  return isConfigured();
}
