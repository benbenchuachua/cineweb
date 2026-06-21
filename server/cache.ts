const MAX_ENTRIES = 200;
const GRAPH_TTL_MS = 6 * 60 * 60 * 1000; // 6h — cast/filmography rarely changes
const SEARCH_TTL_MS = 15 * 60 * 1000;

interface Entry {
  data: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

/** LRU: re-insert on read so Map iteration order = recency */
function touch(key: string, entry: Entry) {
  store.delete(key);
  store.set(key, entry);
}

function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
    else break;
  }
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  touch(key, entry);
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlMs = GRAPH_TTL_MS) {
  store.set(key, { data, expires: Date.now() + ttlMs });
  evictIfNeeded();
}

export function graphCacheTtl() {
  return GRAPH_TTL_MS;
}

export function searchCacheTtl() {
  return SEARCH_TTL_MS;
}

export function cacheStats() {
  return { size: store.size, max: MAX_ENTRIES };
}
