const MINUTE = 60_000;

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Per-IP limits (per minute)
const GLOBAL_LIMIT = 60;
const SEARCH_LIMIT = 15;
const GRAPH_LIMIT = 40;

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number;
}

function check(key: string, limit: number, windowMs = MINUTE): RateLimitResult {
  const now = Date.now();
  let w = store.get(key);
  if (!w || now > w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    store.set(key, w);
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count++;
  return { ok: true };
}

export function enforceRateLimit(ip: string, bucket: "search" | "graph"): RateLimitResult {
  const global = check(`global:${ip}`, GLOBAL_LIMIT);
  if (!global.ok) return global;
  return check(`${bucket}:${ip}`, bucket === "search" ? SEARCH_LIMIT : GRAPH_LIMIT);
}

export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() || "unknown";
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(",")[0]?.trim() || "unknown";
  const real = headers["x-real-ip"];
  if (typeof real === "string") return real;
  return "unknown";
}
