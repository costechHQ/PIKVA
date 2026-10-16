/** Tests for /api/pickers/[id]/photo (SRS 9.3): photo bytes through the session. */
import { afterEach, describe, expect, test } from "bun:test";

import photo from "@/pages/api/pickers/[id]/photo";
import { PHOTO_UPLOAD_MAX_BYTES, photoPath } from "@/lib/photos";
import { SESSION_COOKIE } from "@/lib/session";
import {
  type FakeBackend,
  deadBackendUrl,
  fakeRequest,
  fakeResponse,
  startBackend,
  tokenExpiringIn,
} from "./helpers";

const TOKEN = tokenExpiringIn(1800);
const MULTIPART = "multipart/form-data; boundary=----pikva";
// Not valid UTF-8, so a text round trip would change it.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x80, 0xfe, 0xff, 0xd9]);

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

async function call(
  method: string,
  init: {
    id?: string;
    stream?: Uint8Array[];
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
) {
  const res = fakeResponse();
  await photo(
    fakeRequest({
      method,
      query: { id: init.id ?? "5" },
      headers: init.headers ?? {},
      cookies: init.cookies ?? { [SESSION_COOKIE]: TOKEN },
      stream: init.stream,
    }),
    res,
  );
  return res;
}

function uploadHeaders(length: number): Record<string, string> {
  return { "content-type": MULTIPART, "content-length": String(length) };
}

describe("/api/pickers/[id]/photo", () => {
  test("photoPath names this route", () => {
    expect(photoPath(5)).toBe("/api/pickers/5/photo");
  });

  test("GET returns the photo's exact bytes, never cached", async () => {
    const fake = useBackend(() => new Response(JPEG, { headers: { "Content-Type": "image/jpeg" } }));

    const res = await call("GET");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(new Uint8Array(res.sent as Buffer)).toEqual(JPEG);

    const [request] = fake.requests;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/api/v1/pickers/5/photo");
    expect(request.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  test("GET passes 404 through as JSON", async () => {
    useBackend(() => Response.json({ detail: "Photo not found" }, { status: 404 }));

    const res = await call("GET");

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).detail).toBe("Photo not found");
  });

  test("PUT forwards the multipart body unchanged with its boundary", async () => {
    const fake = useBackend(() => Response.json({ id: 5, status: "pending_approval" }));
    const parts = [JPEG.slice(0, 4), JPEG.slice(4)];

    const res = await call("PUT", { stream: parts, headers: uploadHeaders(JPEG.length) });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("pending_approval");

    const [request] = fake.requests;
    expect(request.method).toBe("PUT");
    expect(request.headers.get("content-type")).toBe(MULTIPART);
    expect(request.headers.get("content-length")).toBe(String(JPEG.length));
    expect(request.bytes).toEqual(JPEG);
  });

  test("PUT passes FastAPI's refusal through", async () => {
    useBackend(() => Response.json({ detail: "The photo must be a JPEG, PNG or WebP image" }, { status: 422 }));

    const res = await call("PUT", { stream: [JPEG], headers: uploadHeaders(JPEG.length) });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).detail).toBe("The photo must be a JPEG, PNG or WebP image");
  });

  test("PUT refuses a declared size over the limit without reading or forwarding", async () => {
    const fake = useBackend(() => Response.json({}));

    const res = await call("PUT", { stream: [], headers: uploadHeaders(PHOTO_UPLOAD_MAX_BYTES + 1) });

    expect(res.statusCode).toBe(413);
    expect(fake.requests).toHaveLength(0);
  });

  test("PUT stops reading a body that grows past the limit", async () => {
    const fake = useBackend(() => Response.json({}));
    const chunk = new Uint8Array(1024 * 1024);
    const stream = Array.from({ length: 6 }, () => chunk);

    // No Content-Length, so only the reading limit can catch it.
    const res = await call("PUT", { stream, headers: { "content-type": MULTIPART } });

    expect(res.statusCode).toBe(413);
    expect(fake.requests).toHaveLength(0);
  });

  test("PUT needs multipart form data", async () => {
    const fake = useBackend(() => Response.json({}));

    const res = await call("PUT", { stream: [JPEG], headers: { "content-type": "image/jpeg" } });

    expect(res.statusCode).toBe(415);
    expect(fake.requests).toHaveLength(0);
  });

  test("DELETE is forwarded", async () => {
    const fake = useBackend(() => Response.json({ id: 5, photo_updated_at: null }));

    const res = await call("DELETE");

    expect(res.statusCode).toBe(200);
    expect(fake.requests[0].method).toBe("DELETE");
  });

  test("refuses other methods and ids that are not numbers", async () => {
    const fake = useBackend(() => Response.json({}));

    expect((await call("POST")).statusCode).toBe(405);
    for (const id of ["abc", "../x", "", "1".repeat(10)]) {
      expect((await call("GET", { id })).statusCode).toBe(404);
    }
    expect(fake.requests).toHaveLength(0);
  });

  test("answers 401 without a session and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json({}));

    const res = await call("GET", { cookies: {} });

    expect(res.statusCode).toBe(401);
    expect(fake.requests).toHaveLength(0);
  });

  test("an ended session clears the cookie", async () => {
    useBackend(() => Response.json({ detail: "Invalid or expired token" }, { status: 401 }));

    const res = await call("GET");

    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toStartWith(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("passes 429 through with Retry-After", async () => {
    useBackend(() => Response.json({ detail: "Too many" }, { status: 429, headers: { "Retry-After": "120" } }));

    const res = await call("DELETE");

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
  });

  test("answers 502 when FastAPI is unreachable", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();

    const res = await call("GET");

    expect(res.statusCode).toBe(502);
  });
});
