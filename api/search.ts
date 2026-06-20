import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchTmdb } from "../../server/tmdb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await searchTmdb(q);
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(message.includes("TMDB_API_KEY") ? 500 : 502).json({ error: message });
  }
}
