import type { NextApiRequest, NextApiResponse } from "next";

import { forwardedFor, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { clearedSessionCookie, secureCookies, sessionToken } from "@/lib/session";

// FastAPI paths are made of plain words and ids; anything else (such as "..")
// could reach a URL outside /api/v1, so it is refused.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

// Sign-in has its own routes so the JWT never reaches the browser.
const BLOCKED_FIRST_SEGMENTS = new Set(["auth"]);

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * /api/proxy/<path>: forward the request to FastAPI /api/v1/<path> with the
 * session cookie's JWT as a Bearer token, and pass the answer back. JSON
 * bodies and query strings are forwarded; a FastAPI 401 (expired or invalid
 * token) also deletes the cookie.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const segments = req.query.path;
  const parts = Array.isArray(segments) ? segments : [segments ?? ""];

  // Photos are bytes, not JSON: they go through /api/pickers/<id>/photo.
  const isPhoto = parts.at(-1) === "photo";

  if (!parts.every((part) => SAFE_SEGMENT.test(part)) || BLOCKED_FIRST_SEGMENTS.has(parts[0]) || isPhoto) {
    return res.status(404).json({ detail: "Not found" });
  }

  const token = sessionToken(req);

  if (!token) {
    return res.status(401).json({ detail: "Not signed in" });
  }

  const method = req.method ?? "GET";
  const search = new URL(req.url ?? "/", "http://localhost").search;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Forwarded-For": forwardedFor(req),
  };
  let body: string | undefined;

  if (METHODS_WITH_BODY.has(method) && req.body !== undefined && req.body !== "") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(req.body);
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/${parts.join("/")}${search}`, {
      method,
      headers,
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
