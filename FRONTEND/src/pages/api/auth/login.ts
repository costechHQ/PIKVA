import type { NextApiRequest, NextApiResponse } from "next";

import { forwardedFor, methodNotAllowed, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { secondsUntilExpiry, secureCookies, sessionCookie } from "@/lib/session";

/**
 * POST /api/auth/login: sign in through FastAPI and keep the JWT in the
 * httpOnly session cookie. The browser gets { ok: true }, never the token.
 * FastAPI errors (401, 422, 429 with Retry-After) are passed through.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, "POST");
  }

  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(422).json({ detail: "Email and password are required" });
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": forwardedFor(req) },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return unavailable(res);
  }

  if (!response.ok) {
    return relay(response, res);
  }

  const { access_token: token } = await response.json();
  const maxAge = typeof token === "string" ? secondsUntilExpiry(token) : null;

  if (maxAge === null || maxAge <= 0) {
    return unavailable(res);
  }

  res.setHeader("Set-Cookie", sessionCookie(token, maxAge, secureCookies()));
  res.status(200).json({ ok: true });
}
