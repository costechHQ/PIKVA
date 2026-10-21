/** Tests for /api/pupils/[id]/photo (SRS 9.3): the same route as pickers, aimed at pupils. */
import { afterEach, describe, expect, test } from "bun:test";

import photo from "@/pages/api/pupils/[id]/photo";
import { SESSION_COOKIE } from "@/lib/session";
import { type FakeBackend, fakeRequest, fakeResponse, startBackend, tokenExpiringIn } from "./helpers";

const TOKEN = tokenExpiringIn(1800);
const MULTIPART = "multipart/form-data; boundary=----pikva";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x80, 0xfe, 0xff, 0xd9]);

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

describe("/api/pupils/[id]/photo", () => {
  test("GET asks FastAPI for the pupil's photo", async () => {
    backend = startBackend(() => new Response(JPEG, { headers: { "Content-Type": "image/jpeg" } }));
    process.env.PIKVA_API_URL = backend.url;
    const res = fakeResponse();

    await photo(fakeRequest({ method: "GET", query: { id: "5" }, cookies: { [SESSION_COOKIE]: TOKEN } }), res);

    expect(res.statusCode).toBe(200);
    expect(new Uint8Array(res.sent as Buffer)).toEqual(JPEG);
    expect(backend.requests[0].path).toBe("/api/v1/pupils/5/photo");
  });

  test("PUT forwards the upload to the pupil's photo", async () => {
    backend = startBackend(() => Response.json({ id: 5 }));
    process.env.PIKVA_API_URL = backend.url;
    const res = fakeResponse();

    await photo(
      fakeRequest({
        method: "PUT",
        query: { id: "5" },
        headers: { "content-type": MULTIPART, "content-length": String(JPEG.length) },
        cookies: { [SESSION_COOKIE]: TOKEN },
        stream: [JPEG],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(backend.requests[0].method).toBe("PUT");
    expect(backend.requests[0].path).toBe("/api/v1/pupils/5/photo");
    expect(backend.requests[0].bytes).toEqual(JPEG);
  });

  test("an id that is not a number is not found", async () => {
    const res = fakeResponse();

    await photo(fakeRequest({ method: "GET", query: { id: "abc" }, cookies: { [SESSION_COOKIE]: TOKEN } }), res);

    expect(res.statusCode).toBe(404);
  });
});
