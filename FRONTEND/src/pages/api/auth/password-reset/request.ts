import type { NextApiRequest, NextApiResponse } from "next";

import { postPublic } from "@/lib/backend";

/**
 * POST /api/auth/password-reset/request { email }: ask FastAPI to email a
 * reset link (SRS 6.6). FastAPI always answers 202 with the same message,
 * so the page never learns whether the email is registered.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return postPublic(req, res, "/api/v1/auth/password-reset/request", ["email"]);
}
