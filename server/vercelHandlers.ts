import type { VercelRequest, VercelResponse } from "@vercel/node";
import { enforceRateLimit, getClientIp } from "./rateLimit";
import { getGraph, getRandomPerson, searchTmdb, tmdbErrorStatus } from "./tmdb";

function rateLimited(res: VercelResponse, retryAfter?: number) {
  if (retryAfter) res.setHeader("Retry-After", String(retryAfter));
  return res.status(429).json({ error: "Too many requests. Please slow down." });
}

export async function handleSearchRequest(req: VercelRequest, res: VercelResponse) {
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

export async function handleRandomRequest(req: VercelRequest, res: VercelResponse) {
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

export async function handleGraphRequest(
  req: VercelRequest,
  res: VercelResponse,
  type: "movie" | "person"
) {
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
