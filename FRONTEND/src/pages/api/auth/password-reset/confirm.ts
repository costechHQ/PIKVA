import type { NextApiRequest, NextApiResponse } from "next";

import { postPublic } from "@/lib/backend";

/**
 * POST /api/auth/password-reset/confirm { token, new_password }: set a new
 * password with the emailed token (SRS 6.6). FastAPI answers 204, or 400
 * when the link is invalid, used or expired.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return postPublic(req, res, "/api/v1/auth/password-reset/confirm", ["token", "new_password"]);
}
