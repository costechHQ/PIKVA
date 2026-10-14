/**
 * Test helpers: a fake FastAPI server and minimal Next.js API request and
 * response objects, so API routes can be called directly.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export type Recorded = { method: string; path: string; headers: Headers; body: string };

export type FakeBackend = {
  url: string;
  requests: Recorded[];
  stop: () => void;
};

/** Start a fake FastAPI on a free port; reply decides each response. */
export function startBackend(reply: (request: Recorded) => Response): FakeBackend {
  const requests: Recorded[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const recorded = {
        method: request.method,
        path: url.pathname + url.search,
        headers: request.headers,
        body: await request.text(),
      };
      requests.push(recorded);
      return reply(recorded);
    },
  });

  return { url: `http://127.0.0.1:${server.port}`, requests, stop: () => server.stop(true) };
}

/** Return the address of a port nothing listens on, for outage tests. */
export function deadBackendUrl(): string {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const url = `http://127.0.0.1:${server.port}`;
  server.stop(true);
  return url;
}

/** Build a minimal NextApiRequest. */
export function fakeRequest(init: {
  method: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  query?: Record<string, string | string[]>;
  ip?: string;
}): NextApiRequest {
  return {
    method: init.method,
    body: init.body,
    cookies: init.cookies ?? {},
    headers: init.headers ?? {},
    query: init.query ?? {},
    socket: { remoteAddress: init.ip ?? "203.0.113.9" },
  } as unknown as NextApiRequest;
}

export type FakeResponse = NextApiResponse & {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/** Build a NextApiResponse that records status, headers and body. */
export function fakeResponse(): FakeResponse {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = String(value);
      return res;
    },
    json(value: unknown) {
      res.headers["content-type"] ??= "application/json";
      res.body = JSON.stringify(value);
      return res;
    },
    send(value: string) {
      res.body = value;
      return res;
    },
    end() {
      return res;
    },
  };

  return res as unknown as FakeResponse;
}

/** Build an unsigned JWT-shaped token that expires in the given seconds. */
export function tokenExpiringIn(seconds: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + seconds;

  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: "1", exp })}.c2lnbmF0dXJl`;
}
