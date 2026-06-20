import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getGraph } from "../../../server/tmdb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const data = await getGraph("person", id);
    return res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(message.includes("TMDB_API_KEY") ? 500 : 502).json({ error: message });
  }
}
