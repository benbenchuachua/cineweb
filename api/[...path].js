// server/rateLimit.ts
var MINUTE = 6e4;
var store = /* @__PURE__ */ new Map();
var GLOBAL_LIMIT = 60;
var SEARCH_LIMIT = 15;
var GRAPH_LIMIT = 40;
function check(key, limit, windowMs = MINUTE) {
  const now = Date.now();
  let w = store.get(key);
  if (!w || now > w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    store.set(key, w);
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((w.resetAt - now) / 1e3) };
  }
  w.count++;
  return { ok: true };
}
function enforceRateLimit(ip, bucket) {
  const global = check(`global:${ip}`, GLOBAL_LIMIT);
  if (!global.ok) return global;
  return check(`${bucket}:${ip}`, bucket === "search" ? SEARCH_LIMIT : GRAPH_LIMIT);
}
function getClientIp(headers) {
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() || "unknown";
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(",")[0]?.trim() || "unknown";
  const real = headers["x-real-ip"];
  if (typeof real === "string") return real;
  return "unknown";
}

// server/cache.ts
var MAX_ENTRIES = 200;
var GRAPH_TTL_MS = 6 * 60 * 60 * 1e3;
var SEARCH_TTL_MS = 15 * 60 * 1e3;
var store2 = /* @__PURE__ */ new Map();
function touch(key, entry) {
  store2.delete(key);
  store2.set(key, entry);
}
function evictIfNeeded() {
  while (store2.size > MAX_ENTRIES) {
    const oldest = store2.keys().next().value;
    if (oldest) store2.delete(oldest);
    else break;
  }
}
function getCached(key) {
  const entry = store2.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    store2.delete(key);
    return null;
  }
  touch(key, entry);
  return entry.data;
}
function setCache(key, data, ttlMs = GRAPH_TTL_MS) {
  store2.set(key, { data, expires: Date.now() + ttlMs });
  evictIfNeeded();
}
function searchCacheTtl() {
  return SEARCH_TTL_MS;
}

// server/tmdb.ts
var TMDB_BASE = "https://api.themoviedb.org/3";
var MAX_CONNECTIONS = 10;
var TMDB_TOKEN_ENV_HINT = "Set TMDB_READ_ACCESS_TOKEN in Vercel (your TMDB API Read Access Token \u2014 not the v3 API key).";
function getTmdbToken() {
  const key = process.env.TMDB_READ_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim();
  if (!key) {
    throw new Error(`TMDB_READ_ACCESS_TOKEN is not set. ${TMDB_TOKEN_ENV_HINT}`);
  }
  return key;
}
function isTmdbConfigError(message) {
  return message.includes("TMDB_READ_ACCESS_TOKEN") || message.includes("TMDB_API_KEY");
}
function tmdbErrorStatus(message) {
  return isTmdbConfigError(message) ? 500 : 502;
}
async function tmdbFetch(path) {
  const cacheKey = path;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const url = `${TMDB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getTmdbToken()}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB ${res.status}: ${text}`);
  }
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
}
function nodeId(type, id) {
  return `${type}-${id}`;
}
function yearFromDate(date) {
  if (!date) return void 0;
  return date.slice(0, 4);
}
async function searchTmdb(query) {
  const q = encodeURIComponent(query.trim());
  if (!q) return { results: [] };
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const [movies, people] = await Promise.all([
    tmdbFetch(`/search/movie?query=${q}`),
    tmdbFetch(`/search/person?query=${q}`)
  ]);
  const movieResults = movies.results.slice(0, 6).map((m) => ({
    id: nodeId("movie", m.id),
    type: "movie",
    tmdbId: m.id,
    title: m.title ?? "Unknown",
    subtitle: "Movie",
    imagePath: m.poster_path ?? null,
    year: yearFromDate(m.release_date)
  }));
  const personResults = people.results.slice(0, 6).map((p) => ({
    id: nodeId("person", p.id),
    type: "person",
    tmdbId: p.id,
    title: p.name ?? "Unknown",
    subtitle: p.known_for_department ?? "Actor",
    imagePath: p.profile_path ?? null
  }));
  const results = [...movieResults, ...personResults].slice(0, 10);
  const response = { results };
  setCache(cacheKey, response, searchCacheTtl());
  return response;
}
async function getMovieGraph(id) {
  const cacheKey = `graph:movie:${id}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const [movie, credits] = await Promise.all([
    tmdbFetch(
      `/movie/${id}`
    ),
    tmdbFetch(`/movie/${id}/credits`)
  ]);
  const center = {
    id: nodeId("movie", id),
    type: "movie",
    tmdbId: id,
    title: movie.title,
    subtitle: "Movie",
    imagePath: movie.poster_path ?? null,
    year: yearFromDate(movie.release_date)
  };
  const connections = credits.cast.filter((c) => c.profile_path).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, MAX_CONNECTIONS).map((c) => ({
    id: nodeId("person", c.id),
    type: "person",
    tmdbId: c.id,
    title: c.name,
    subtitle: c.character,
    imagePath: c.profile_path ?? null
  }));
  const response = { center, connections };
  setCache(cacheKey, response);
  return response;
}
async function getPersonGraph(id) {
  const cacheKey = `graph:person:${id}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const [person, credits] = await Promise.all([
    tmdbFetch(`/person/${id}`),
    tmdbFetch(`/person/${id}/movie_credits`)
  ]);
  const center = {
    id: nodeId("person", id),
    type: "person",
    tmdbId: id,
    title: person.name,
    subtitle: "Actor",
    imagePath: person.profile_path ?? null
  };
  const connections = credits.cast.filter((m) => m.poster_path).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, MAX_CONNECTIONS).map((m) => ({
    id: nodeId("movie", m.id),
    type: "movie",
    tmdbId: m.id,
    title: m.title,
    subtitle: "Movie",
    imagePath: m.poster_path ?? null,
    year: yearFromDate(m.release_date)
  }));
  const response = { center, connections };
  setCache(cacheKey, response);
  return response;
}
async function getGraph(type, id) {
  return type === "movie" ? getMovieGraph(id) : getPersonGraph(id);
}
async function getRandomPerson() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const page = Math.floor(Math.random() * 100) + 1;
    const data = await tmdbFetch(`/person/popular?page=${page}`);
    const pool = data.results.filter((p) => p.profile_path);
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return {
      result: {
        id: nodeId("person", pick.id),
        type: "person",
        tmdbId: pick.id,
        title: pick.name,
        subtitle: pick.known_for_department ?? "Actor",
        imagePath: pick.profile_path ?? null
      }
    };
  }
  throw new Error("Could not find a random person \u2014 try again");
}

// server/vercelHandlers.ts
function rateLimited(res, retryAfter) {
  if (retryAfter) res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({ error: "Too many requests. Please slow down." });
}
async function handleSearchRequest(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = getClientIp(req.headers);
  const limit = enforceRateLimit(ip, "search");
  if (!limit.ok) return rateLimited(res, limit.retryAfter);
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length > 100) {
      return res.status(400).json({ error: "Query too long" });
    }
    const data = await searchTmdb(q);
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(tmdbErrorStatus(message)).json({ error: message });
  }
}
async function handleRandomRequest(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = getClientIp(req.headers);
  const limit = enforceRateLimit(ip, "search");
  if (!limit.ok) return rateLimited(res, limit.retryAfter);
  try {
    const data = await getRandomPerson();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(tmdbErrorStatus(message)).json({ error: message });
  }
}
async function handleGraphRequest(req, res, type) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const ip = getClientIp(req.headers);
  const limit = enforceRateLimit(ip, "graph");
  if (!limit.ok) return rateLimited(res, limit.retryAfter);
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const data = await getGraph(type, id);
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(tmdbErrorStatus(message)).json({ error: message });
  }
}

// server/vercelEntry.ts
function pathParts(req) {
  const segments = req.query.path;
  if (Array.isArray(segments)) return segments;
  if (typeof segments === "string") return [segments];
  return [];
}
async function handler(req, res) {
  const parts = pathParts(req);
  if (parts[0] === "health") {
    const hasToken = Boolean(
      process.env.TMDB_READ_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim()
    );
    return res.status(200).json({ ok: true, tmdbConfigured: hasToken });
  }
  if (parts[0] === "search") {
    return handleSearchRequest(req, res);
  }
  if (parts[0] === "random") {
    return handleRandomRequest(req, res);
  }
  if (parts[0] === "graph" && parts[1] === "movie" && parts[2]) {
    req.query.id = parts[2];
    return handleGraphRequest(req, res, "movie");
  }
  if (parts[0] === "graph" && parts[1] === "person" && parts[2]) {
    req.query.id = parts[2];
    return handleGraphRequest(req, res, "person");
  }
  return res.status(404).json({ error: "Not found" });
}
var vercelEntry_default = handler;
export {
  vercelEntry_default as default
};
