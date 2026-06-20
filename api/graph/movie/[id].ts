import { handleGraphRequest } from "../../../server/vercelHandlers";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default (req: VercelRequest, res: VercelResponse) =>
  handleGraphRequest(req, res, "movie");
