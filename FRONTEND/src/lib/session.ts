/**
 * Session cookie helpers. Server-only: import from API routes.
 *
 * The FastAPI JWT is kept in an httpOnly, SameSite=Strict cookie, so browser
 * JavaScript can never read it and other sites cannot send it.
 */
import type { NextApiRequest } from "next";

export const SESSION_COOKIE = "pikva_session";

// Three base64url parts: the only shape a FastAPI JWT can have. Anything else
// could smuggle extra attributes (such as "; Domain=") into Set-Cookie.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Return whether cookies should be marked Secure (HTTPS only). */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Build a Set-Cookie value storing the token for maxAgeSeconds. */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  if (!JWT_SHAPE.test(token)) {
    throw new Error("Refusing to store a value that is not a JWT");
  }

  return withAttributes(`${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeSeconds)}`, secure);
}

/** Build a Set-Cookie value that deletes the session cookie. */
export function clearedSessionCookie(secure: boolean): string {
  return withAttributes(`${SESSION_COOKIE}=; Path=/; Max-Age=0`, secure);
}

/** Return the JWT from the request's session cookie, or null. */
export function sessionToken(req: Pick<NextApiRequest, "cookies">): string | null {
  return req.cookies[SESSION_COOKIE] || null;
}

/** Return seconds until the token's exp claim, or null if it cannot be read. */
export function secondsUntilExpiry(token: string, nowMs: number = Date.now()): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp - Math.floor(nowMs / 1000) : null;
  } catch {
    return null;
  }
}

/** Add the attributes every session cookie shares. */
function withAttributes(cookie: string, secure: boolean): string {
  return `${cookie}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
