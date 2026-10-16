/** Tests for /api/proxy/[...path] (adds the Bearer token, never exposes it). */
import { afterEach, describe, expect, test } from "bun:test";

import proxy from "@/pages/api/proxy/[...path]";
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

let backend: FakeBackend | undefined;

afterEach(() => backend?.stop());

/** Point the route at a fake FastAPI that answers every request with reply. */
function useBackend(reply: () => Response): FakeBackend {
  backend = startBackend(reply);
  process.env.PIKVA_API_URL = backend.url;
  return backend;
}

/** Call the proxy as the browser would call /api/proxy/<path><search>. */
async function callProxy(
  method: string,
  path: string[],
  init: { search?: string; body?: unknown; cookies?: Record<string, string> } = {},
) {
  const res = fakeResponse();
  await proxy(
    fakeRequest({
      method,
      body: init.body,
      cookies: init.cookies ?? { [SESSION_COOKIE]: TOKEN },
      query: { path },
      url: `/api/proxy/${path.join("/")}${init.search ?? ""}`,
    }),
    res,
  );
  return res;
}

describe("/api/proxy/[...path]", () => {
  test("forwards a GET with its query string and the Bearer token", async () => {
    const fake = useBackend(() => Response.json([{ id: 1 }]));

    const res = await callProxy("GET", ["alerts"], { search: "?resolved=false&limit=20" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{ id: 1 }]);
    expect(res.body).not.toContain(TOKEN);

    const [call] = fake.requests;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/api/v1/alerts?resolved=false&limit=20");
    expect(call.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(call.body).toBe("");
  });

  test("forwards a POST with its JSON body", async () => {
    const fake = useBackend(() => Response.json({ id: 5 }, { status: 201 }));
    const body = { first_name: "Tobi", last_name: "Ade" };

    const res = await callProxy("POST", ["pupils"], { body });

    expect(res.statusCode).toBe(201);

    const [call] = fake.requests;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/api/v1/pupils");
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(call.body)).toEqual(body);
  });

  test("joins nested paths", async () => {
    const fake = useBackend(() => Response.json({ id: 9 }));

    await callProxy("POST", ["alerts", "9", "resolve"]);

    expect(fake.requests[0].path).toBe("/api/v1/alerts/9/resolve");
  });

  test("refuses auth paths so the token never reaches the browser", async () => {
    const fake = useBackend(() => Response.json({ access_token: TOKEN }));

    const res = await callProxy("POST", ["auth", "login"], { body: {} });

    expect(res.statusCode).toBe(404);
    expect(fake.requests).toHaveLength(0);
  });

  test("refuses photo paths, which carry bytes and have their own route", async () => {
    const fake = useBackend(() => Response.json({}));

    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await callProxy(method, ["pickers", "5", "photo"]);
      expect(res.statusCode).toBe(404);
    }
    expect(fake.requests).toHaveLength(0);
  });

  test("refuses unsafe path segments", async () => {
    const fake = useBackend(() => Response.json({}));

    for (const path of [[".."], ["pupils", ".."], ["pupils", "1?x=1"], ["a%2Fb"], [""]]) {
      const res = await callProxy("GET", path);
      expect(res.statusCode).toBe(404);
    }
    expect(fake.requests).toHaveLength(0);
  });

  test("answers 401 without a cookie and does not call FastAPI", async () => {
    const fake = useBackend(() => Response.json({}));

    const res = await callProxy("GET", ["pupils"], { cookies: {} });

    expect(res.statusCode).toBe(401);
    expect(fake.requests).toHaveLength(0);
  });

  test("clears the cookie when FastAPI rejects the token", async () => {
    useBackend(() => Response.json({ detail: "Could not validate credentials" }, { status: 401 }));

    const res = await callProxy("GET", ["pupils"]);

    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toContain(`${SESSION_COOKIE}=; Path=/; Max-Age=0`);
  });

  test("passes 403 through and keeps the cookie", async () => {
    useBackend(() => Response.json({ detail: "Not enough permissions" }, { status: 403 }));

    const res = await callProxy("GET", ["audit-logs"]);

    expect(res.statusCode).toBe(403);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("passes 429 through with Retry-After", async () => {
    useBackend(
      () =>
        Response.json(
          { detail: "Too many requests. Try again later." },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
    );

    const res = await callProxy("POST", ["pickup", "verify"], { body: { code: "ABCD2345" } });

    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("30");
  });

  test("answers 502 when FastAPI is unreachable", async () => {
    process.env.PIKVA_API_URL = deadBackendUrl();

    const res = await callProxy("GET", ["pupils"]);

    expect(res.statusCode).toBe(502);
  });
});
