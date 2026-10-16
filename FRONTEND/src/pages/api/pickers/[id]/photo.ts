import type { NextApiRequest, NextApiResponse } from "next";

import { forwardedFor, methodNotAllowed, relay, unavailable } from "@/lib/backend";
import { apiBaseUrl } from "@/lib/config";
import { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photos";
import { clearedSessionCookie, secureCookies, sessionToken } from "@/lib/session";

// The upload is forwarded as it arrives, so Next.js must not parse it
// (its parser handles JSON and text only, up to 1 MB).
export const config = { api: { bodyParser: false } };

const ID = /^\d{1,9}$/;
const ALLOWED = "GET, PUT, DELETE";
const TOO_LARGE = { detail: "The photo must be 5 MB or smaller" };

class BodyTooLarge extends Error {}

/** Read the request body, stopping as soon as it passes limit bytes. */
async function readBody(req: NextApiRequest, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new BodyTooLarge();
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * /api/pickers/<id>/photo (SRS 9.3): a pickup person's photo through the
 * session. GET returns the JPEG as bytes; PUT forwards a multipart upload
 * unchanged after checking its size; DELETE removes it. The generic proxy
 * refuses photo paths, because it carries JSON only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id : "";

  if (!ID.test(id)) {
    return res.status(404).json({ detail: "Not found" });
  }

  const method = req.method ?? "GET";

  if (!["GET", "PUT", "DELETE"].includes(method)) {
    return methodNotAllowed(res, ALLOWED);
  }

  const token = sessionToken(req);

  if (!token) {
    return res.status(401).json({ detail: "Not signed in" });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Forwarded-For": forwardedFor(req),
  };
  let body: Uint8Array<ArrayBuffer> | undefined;

  if (method === "PUT") {
    const type = req.headers["content-type"] ?? "";
    const declared = req.headers["content-length"] ?? "";

    if (!type.startsWith("multipart/form-data")) {
      return res.status(415).json({ detail: "Send the photo as multipart form data" });
    }

    // Refused before reading when the declared size is already too big.
    if (/^\d+$/.test(declared) && Number(declared) > PHOTO_UPLOAD_MAX_BYTES) {
      return res.status(413).json(TOO_LARGE);
    }

    try {
      body = new Uint8Array(await readBody(req, PHOTO_UPLOAD_MAX_BYTES));
    } catch (error) {
      if (error instanceof BodyTooLarge) return res.status(413).json(TOO_LARGE);
      throw error;
    }

    headers["Content-Type"] = type;
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/api/v1/pickers/${id}/photo`, { method, headers, body });
  } catch {
    return unavailable(res);
  }

  if (response.status === 401) {
    res.setHeader("Set-Cookie", clearedSessionCookie(secureCookies()));
  }

  if (method === "GET" && response.ok) {
    // Photos of real people: never kept by the browser or shared caches.
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(Buffer.from(await response.arrayBuffer()));
  }

  return relay(response, res);
}
