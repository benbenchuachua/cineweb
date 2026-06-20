const store = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60 * 60 * 1000;

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || entry.expires < Date.now()) {
    if (entry) store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlMs = TTL_MS) {
  store.set(key, { data, expires: Date.now() + ttlMs });
}
