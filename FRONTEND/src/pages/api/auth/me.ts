import type { NextApiRequest, NextApiResponse } from "next";

import { methodNotAllowed, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { clearedSessionCookie, secureCookies, sessionToken } from "@/lib/session";

/**
 * GET /api/auth/me: return the signed-in user (id, name, role, school) from
 * FastAPI, using the JWT in the session cookie. With no cookie, answer 401
 * without calling FastAPI. When FastAPI answers 401 (expired or invalid
 * token), delete the cookie so the browser is cleanly signed out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, "GET");
  }

  const token = sessionToken(req);

  if (!token) {
    return res.status(401).json({ detail: "Not signed in" });
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return unavailable(res);
  }

  if (response.status === 401) {
    res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
  }

  return relay(response, res);
}
