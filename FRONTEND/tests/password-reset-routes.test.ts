/** Tests for the public password reset BFF routes (SRS 6.6). */
import { afterEach, describe, expect, test } from "bun:test";

import confirm from "@/pages/api/auth/password-reset/confirm";
import request from "@/pages/api/auth/password-reset/request";
import { type FakeBackend, deadBackendUrl, fakeRequest, fakeResponse, startBackend } from "./helpers";

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

const SENT = { detail: "If an account exists for that email, we have sent a link to reset its password." };

describe("POST /api/auth/password-reset/request", () => {
  test("forwards only the email, with the browser's IP", async () => {
    const fake = useBackend(() => Response.json(SENT, { status: 202 }));
    const res = fakeResponse();

    await request(
      fakeRequest({ method: "POST", body: { email: "a@school.example", role: "x" }, ip: "198.51.100.7" }),
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual(SENT);
    const [call] = fake.requests;
    expect(call.path).toBe("/api/v1/auth/password-reset/request");
    expect(JSON.parse(call.body)).toEqual({ email: "a@school.example" });
    expect(call.headers.get("x-forwarded-for")).toBe("198.51.100.7");
  });

  test("relays 429 with Retry-After", async () => {
    useBackend(() =>
      Response.json({ detail: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": "120" } }),
    );
    const res = fakeResponse();

    await request(fakeRequest({ method: "POST", body: { email: "a@school.example" } }), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
  });

  test("rejects other methods without calling FastAPI", async () => {
    const fake = useBackend(() => new Response(null, { status: 500 }));
    const res = fakeResponse();

    await request(fakeRequest({ method: "GET" }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("POST");
    expect(fake.requests).toHaveLength(0);
  });

  test("answers 502 when FastAPI is down", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();
    const res = fakeResponse();

    await request(fakeRequest({ method: "POST", body: { email: "a@school.example" } }), res);

    expect(res.statusCode).toBe(502);
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  const BODY = { token: "emailed-token", new_password: "NewPassword123!" };

  test("forwards token and new password and relays 204", async () => {
    const fake = useBackend(() => new Response(null, { status: 204 }));
    const res = fakeResponse();

    await confirm(fakeRequest({ method: "POST", body: { ...BODY, email: "x@y.z" } }), res);

    expect(res.statusCode).toBe(204);
    expect(fake.requests[0].path).toBe("/api/v1/auth/password-reset/confirm");
    expect(JSON.parse(fake.requests[0].body)).toEqual(BODY);
  });

  test("relays FastAPI's 400 for a bad link", async () => {
    const detail = { detail: "This reset link is invalid or has expired" };
    useBackend(() => Response.json(detail, { status: 400 }));
    const res = fakeResponse();

    await confirm(fakeRequest({ method: "POST", body: BODY }), res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual(detail);
  });

  test("never sets a cookie", async () => {
    useBackend(() => new Response(null, { status: 204 }));
    const res = fakeResponse();

    await confirm(fakeRequest({ method: "POST", body: BODY }), res);

    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
