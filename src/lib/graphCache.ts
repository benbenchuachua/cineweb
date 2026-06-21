import type { GraphResponse, SearchResponse } from "../../server/types";

const MEMORY_MAX = 80;
const SESSION_PREFIX = "cineweb:g:";
const SESSION_MAX_BYTES = 2_500_000;

type CacheKey = `${"movie" | "person"}:${number}`;

function cacheKey(type: "movie" | "person", id: number): CacheKey {
  return `${type}:${id}`;
}

/** In-memory LRU */
const memory = new Map<CacheKey, GraphResponse>();
const memoryOrder: CacheKey[] = [];

/** Dedupe concurrent fetches for the same node */
const inflight = new Map<CacheKey, Promise<GraphResponse>>();

function touchMemory(key: CacheKey, data: GraphResponse) {
  const idx = memoryOrder.indexOf(key);
  if (idx >= 0) memoryOrder.splice(idx, 1);
  memoryOrder.push(key);
  memory.set(key, data);
  while (memoryOrder.length > MEMORY_MAX) {
    const old = memoryOrder.shift();
    if (old) memory.delete(old);
  }
}

function readSession(key: CacheKey): GraphResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { exp: number; data: GraphResponse };
    if (parsed.exp < Date.now()) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSession(key: CacheKey, data: GraphResponse) {
  try {
    const payload = JSON.stringify({ exp: Date.now() + 6 * 60 * 60 * 1000, data });
    if (payload.length > SESSION_MAX_BYTES / 20) return;
    sessionStorage.setItem(SESSION_PREFIX + key, payload);
  } catch {
    /* quota — evict oldest cineweb keys */
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.slice(0, Math.ceil(keys.length / 3)).forEach((k) => sessionStorage.removeItem(k));
  }
}

async function fetchFromNetwork(type: "movie" | "person", id: number): Promise<GraphResponse> {
  const res = await fetch(`/api/graph/${type}/${id}`);
  if (!res.ok) throw new Error("Failed to load graph");
  return res.json() as Promise<GraphResponse>;
}

export function getCachedGraph(type: "movie" | "person", id: number): GraphResponse | null {
  const key = cacheKey(type, id);
  const mem = memory.get(key);
  if (mem) {
    touchMemory(key, mem);
    return mem;
  }
  const sess = readSession(key);
  if (sess) {
    touchMemory(key, sess);
    return sess;
  }
  return null;
}

export async function fetchGraph(type: "movie" | "person", id: number): Promise<GraphResponse> {
  const key = cacheKey(type, id);

  const cached = getCachedGraph(type, id);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetchFromNetwork(type, id)
    .then((data) => {
      touchMemory(key, data);
      writeSession(key, data);
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** Warm cache in idle time — does not block UI */
export function prefetchGraph(type: "movie" | "person", id: number) {
  if (getCachedGraph(type, id) || inflight.has(cacheKey(type, id))) return;

  const run = () => {
    fetchGraph(type, id).catch(() => {});
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 50);
  }
}

export function prefetchConnections(connections: Array<{ type: "movie" | "person"; tmdbId: number }>) {
  connections.forEach((c, i) => {
    setTimeout(() => prefetchGraph(c.type, c.tmdbId), i * 120);
  });
}

export async function search(query: string): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}
