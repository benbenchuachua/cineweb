import type { IncomingMessage, ServerResponse } from "node:http";
import { getGraph, searchTmdb } from "./tmdb";

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage) {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const url = parseUrl(req);
    const path = url.pathname;

    if (path === "/api/search") {
      const q = url.searchParams.get("q") ?? "";
      const data = await searchTmdb(q);
      sendJson(res, 200, data);
      return;
    }

    const movieMatch = path.match(/^\/api\/graph\/movie\/(\d+)$/);
    if (movieMatch) {
      const data = await getGraph("movie", Number(movieMatch[1]));
      sendJson(res, 200, data);
      return;
    }

    const personMatch = path.match(/^\/api\/graph\/person\/(\d+)$/);
    if (personMatch) {
      const data = await getGraph("person", Number(personMatch[1]));
      sendJson(res, 200, data);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("TMDB_API_KEY") ? 500 : 502;
    sendJson(res, status, { error: message });
  }
}
