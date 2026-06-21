import { handleGraphRequest } from "../../../server/vercelHandlers";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async (req: VercelRequest, res: VercelResponse) => {
  await handleGraphRequest(req, res, "movie");
};
