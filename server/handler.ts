import type { IncomingMessage, ServerResponse } from "node:http";
import { enforceRateLimit, getClientIp } from "./rateLimit";
import { getGraph, getRandomPerson, searchTmdb, tmdbErrorStatus } from "./tmdb";

function sendJson(res: ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (headers) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  }
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage) {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

async function sendGraph(
  res: ServerResponse,
  ip: string,
  type: "movie" | "person",
  id: number
) {
  const limit = enforceRateLimit(ip, "graph");
  if (!limit.ok) {
    sendJson(res, 429, { error: "Too many requests. Please slow down." }, {
      "Retry-After": String(limit.retryAfter ?? 60),
    });
    return;
  }
  const data = await getGraph(type, id);
  sendJson(res, 200, data, {
    "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
  });
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>);

  try {
    const url = parseUrl(req);
    const path = url.pathname;

    if (path === "/api/search") {
      const limit = enforceRateLimit(ip, "search");
      if (!limit.ok) {
        sendJson(res, 429, { error: "Too many requests. Please slow down." }, {
          "Retry-After": String(limit.retryAfter ?? 60),
        });
        return;
      }
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length > 100) {
        sendJson(res, 400, { error: "Query too long" });
        return;
      }
      const data = await searchTmdb(q);
      sendJson(res, 200, data, {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      });
      return;
    }

    if (path === "/api/random") {
      const limit = enforceRateLimit(ip, "search");
      if (!limit.ok) {
        sendJson(res, 429, { error: "Too many requests. Please slow down." }, {
          "Retry-After": String(limit.retryAfter ?? 60),
        });
        return;
      }
      const data = await getRandomPerson();
      sendJson(res, 200, data, {
        "Cache-Control": "no-store",
      });
      return;
    }

    if (path === "/api/graph") {
      const type = url.searchParams.get("type");
      const id = Number(url.searchParams.get("id"));
      if ((type === "movie" || type === "person") && Number.isFinite(id) && id > 0) {
        await sendGraph(res, ip, type, id);
        return;
      }
      sendJson(res, 400, { error: "Invalid graph request" });
      return;
    }

    const movieMatch = path.match(/^\/api\/graph\/movie\/(\d+)$/);
    if (movieMatch) {
      await sendGraph(res, ip, "movie", Number(movieMatch[1]));
      return;
    }

    const personMatch = path.match(/^\/api\/graph\/person\/(\d+)$/);
    if (personMatch) {
      await sendGraph(res, ip, "person", Number(personMatch[1]));
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendJson(res, tmdbErrorStatus(message), { error: message });
  }
}
