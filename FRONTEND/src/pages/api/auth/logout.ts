import type { NextApiRequest, NextApiResponse } from "next";

import { methodNotAllowed } from "@/lib/backend";
import { clearedSessionCookie, secureCookies } from "@/lib/session";

/**
 * POST /api/auth/logout: delete the session cookie. FastAPI JWTs cannot be
 * revoked, so the token itself stays valid until it expires; the httpOnly
 * cookie means browser scripts never had it.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, "POST");
  }

  res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
  res.status(204).end();
}
