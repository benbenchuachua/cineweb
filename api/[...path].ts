import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  handleGraphRequest,
  handleRandomRequest,
  handleSearchRequest,
} from "./lib/vercelHandlers";

function pathParts(req: VercelRequest): string[] {
  const segments = req.query.path;
  if (Array.isArray(segments)) return segments;
  if (typeof segments === "string") return [segments];
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
