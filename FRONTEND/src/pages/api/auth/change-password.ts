import type { NextApiRequest, NextApiResponse } from "next";

import { methodNotAllowed, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { clearedSessionCookie, secondsUntilExpiry, secureCookies, sessionCookie, sessionToken } from "@/lib/session";

/**
 * POST /api/auth/change-password (SRS 6.8): change the signed-in user's
 * password through FastAPI. FastAPI signs out every other session and
 * returns a new token, which replaces the one in the httpOnly cookie, so
 * this browser stays signed in. The browser gets { ok: true }, never a
 * token. Errors (400 wrong password, 422, 429 with Retry-After) are passed
 * through; a 401 also clears the cookie, as the session has ended.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, "POST");
  }

  const token = sessionToken(req);
  if (!token) {
    return res.status(401).json({ detail: "Not signed in" });
  }

  const { current_password: current, new_password: next } = req.body ?? {};
  if (typeof current !== "string" || typeof next !== "string") {
    return res.status(422).json({ detail: "Current and new password are required" });
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
  } catch {
    return unavailable(res);
  }

  if (response.status === 401) {
    res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
    return relay(response, res);
  }
  if (!response.ok) {
    return relay(response, res);
  }

  const { access_token: fresh } = await response.json();
  const maxAge = typeof fresh === "string" ? secondsUntilExpiry(fresh) : null;
  if (maxAge === null || maxAge <= 0) {
    return unavailable(res);
  }

  res.setHeader("Set-Cookie", sessionCookie(fresh, maxAge, secureCookies()));
  res.status(200).json({ ok: true });
}
