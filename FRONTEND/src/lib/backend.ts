/**
 * Calls from Next.js API routes to FastAPI. Server-only.
 */
import type { NextApiRequest, NextApiResponse } from "next";

// Response headers worth passing to the browser; everything else stays here.
const RELAYED_HEADERS = ["content-type", "retry-after"];

/**
 * Return X-Forwarded-For for FastAPI: any incoming chain plus this request's
 * peer address. FastAPI trusts only its proxy, so it takes the rightmost
 * address it does not trust, and a value faked by the browser is ignored.
 */
export function forwardedFor(req: Pick<NextApiRequest, "headers" | "socket">): string {
  const incoming = req.headers["x-forwarded-for"];
  const chain = Array.isArray(incoming) ? incoming.join(", ") : incoming;
  const peer = req.socket.remoteAddress ?? "unknown";

  return chain ? `${chain}, ${peer}` : peer;
}

/** Send FastAPI's status, body and safe headers back to the browser. */
export async function relay(response: Response, res: NextApiResponse): Promise<void> {
  for (const name of RELAYED_HEADERS) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  res.status(response.status).send(await response.text());
}

/** Answer 502 when FastAPI cannot be reached. */
export function unavailable(res: NextApiResponse): void {
  res.status(502).json({ detail: "Pikva service is unavailable. Try again shortly." });
}

/** Answer 405 with the allowed method. */
export function methodNotAllowed(res: NextApiResponse, allowed: string): void {
  res.setHeader("Allow", allowed);
  res.status(405).json({ detail: "Method not allowed" });
}
