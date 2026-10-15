# Pikva Web

The Pikva web app (Next.js, Pages Router, Bun). See `../PIKVA_SRS.md`
section 18. One app for all three roles:

- **School admins** (`/admin`): dashboard, pupils, pickup people and
  approvals, pickup history, security alerts, audit log, users.
- **Parents** (`/parent`): their pupils, pickup people, today's pickup code
  (with QR), pickup history, settings.
- **Gate staff** (`/gate`): check a code by typing or scanning its QR,
  then release or refuse.

Everyone has an account page for their details and password.

## Setup

```bash
cp .env.example .env.local   # then adjust PIKVA_API_URL if needed
bun install
bun dev                      # http://localhost:3000
```

The FastAPI backend (`../BACKEND`) must be running at `PIKVA_API_URL`.

## Scripts

| Command | What it does |
| --- | --- |
| `bun dev` | Development server |
| `bun run build` / `bun run start` | Production build and server (see `DEPLOYMENT.md`) |
| `bun test` | Unit tests (`tests/`) |
| `bunx tsc --noEmit` | Type check |
| `bun run lint` | ESLint |
| `bun run test:e2e` | Browser tests (`e2e/`, Playwright) |

### Browser tests

`bun run test:e2e` needs FastAPI and `bun dev` running, and Chromium
(`bunx playwright install chromium` once). It creates a throwaway school
tagged `e2e-…` directly in the backend's configured (development) database
through `../BACKEND/scripts/e2e_school.py`, runs the admin, parent and gate
journeys and every page at phone and laptop width, then deletes that school.
The script refuses to run when the backend is set to production. Set
`PIKVA_WEB_URL` to test another address, such as a local production build.

## Security model

- The browser never talks to FastAPI and never sees the JWT. Next.js API
  routes sign in to FastAPI, keep the token in an httpOnly cookie, and
  forward API calls with the Bearer token. `PIKVA_API_URL` is server-only.
- Every page view gets a fresh nonce and a strict Content Security Policy
  (`src/proxy.ts`, `src/lib/csp.ts`): only this site's scripts and styles
  carrying that nonce may run. Avoid inline `style=` attributes; the policy
  blocks them.
- Other security headers are in `next.config.ts`.

Deployment: see `DEPLOYMENT.md`.
