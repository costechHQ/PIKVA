# Pikva web deployment checklist

Covers the Next.js web app (SRS 18, 21.1, 27). Deploy the backend first
(`../BACKEND/DEPLOYMENT.md`); tick each line for every new environment.

## 1. Host

- [ ] Bun 1.3 and Node.js 20 or newer installed.
- [ ] The web app runs behind an HTTPS reverse proxy. HTTPS is required, not
      optional: the session cookie is `Secure` in production, the gate camera
      only works on secure pages, and the security policy upgrades every
      request to HTTPS.
- [ ] The web host can reach FastAPI over the private network. The browser
      never talks to FastAPI directly, so FastAPI need not be public at all.

## 2. Configuration

Copy `.env.example` to `.env.local` (or set it in the host's secret store):

- [ ] `PIKVA_API_URL` set to FastAPI's address as the web host sees it, such as
      `http://10.0.0.5:8000`. It is server-only and never sent to browsers.
- [ ] `.env.local` is not in git.

On the backend, to match:

- [ ] `WEB_APP_URL` is this app's public `https://` address (links in emails).
- [ ] `FORWARDED_ALLOW_IPS` includes the web host's address. The web app calls
      FastAPI on behalf of every browser and passes the browser's IP in
      `X-Forwarded-For`; if FastAPI does not trust the web host, every sign-in
      appears to come from one IP and the per-IP login limit blocks the
      whole school.
- [ ] The reverse proxy in front of the web app sets `X-Forwarded-For`, and
      the web app is reachable only through it, so browsers cannot fake it.

## 3. Build and run

- [ ] From `FRONTEND/`: `bun install --frozen-lockfile`, then `bun run build`.
      If the build seems to hang after printing its route table, it has
      finished: a leftover Turbopack worker can keep the process open.
- [ ] Start with `bun run start -- -p 3000` (or a process manager running
      `next start`), behind the reverse proxy.
- [ ] Every page is rendered per request: each page view gets a fresh
      security-policy nonce (`src/proxy.ts`). Do not put pages behind a
      shared page cache; static files under `/_next/static` can be cached.

## 4. Checks after starting

- [ ] `https://<web>/login` loads and signs in; the `Set-Cookie` for
      `pikva_session` has `HttpOnly; Secure; SameSite=Strict`.
- [ ] The login page's `Content-Security-Policy` header has a `nonce-…` and
      no `unsafe-inline` or `unsafe-eval`.
- [ ] `https://<web>/api/proxy/pupils` without signing in returns 401.
- [ ] A forgot-password email arrives and its link opens this site.
- [ ] On a gate phone: Gate Verification → Scan QR code opens the camera and
      reads a parent's QR code.
- [ ] Sign-ins from two different networks are rate limited separately
      (proves `FORWARDED_ALLOW_IPS` is right).

## 5. Before each release

- [ ] `bun test`, `bunx tsc --noEmit` and `bun run lint` pass.
- [ ] `bun run test:e2e` passes against a development environment (see
      README). Never point it at production: it creates and deletes a test
      school in the configured database.
