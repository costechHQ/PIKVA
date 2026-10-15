import type { NextApiRequest, NextApiResponse } from "next";

import { methodNotAllowed, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { clearedSessionCookie, secureCookies, sessionToken } from "@/lib/session";

/**
 * GET /api/auth/me: return the signed-in user (id, name, role, school) from
 * FastAPI, using the JWT in the session cookie. PATCH changes the user's own
 * name and/or phone (SRS 6.9); only those two fields are passed on. With no
 * cookie, answer 401 without calling FastAPI. When FastAPI answers 401
 * (expired or invalid token), delete the cookie so the browser is cleanly
 * signed out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return methodNotAllowed(res, "GET, PATCH");
  }

  const token = sessionToken(req);

  if (!token) {
    return res.status(401).json({ detail: "Not signed in" });
  }

  let body: string | undefined;
  if (req.method === "PATCH") {
    const sent = req.body ?? {};
    const fields: Record<string, unknown> = {};
    for (const field of ["name", "phone"]) {
      if (field in sent) fields[field] = sent[field];
    }
    body = JSON.stringify(fields);
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body,
    });
  } catch {
    return unavailable(res);
  }

  if (response.status === 401) {
    res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
  }

  return relay(response, res);
}
