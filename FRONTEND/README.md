# Pikva Web

School admin and gate staff web app for Pikva (Next.js, Pages Router, Bun).
See `../PIKVA_SRS.md` section 18.

## Setup

```bash
cp .env.example .env.local   # then adjust PIKVA_API_URL if needed
bun install
bun dev                      # http://localhost:3000
```

The FastAPI backend (`../BACKEND`) must be running at `PIKVA_API_URL`.

## Security model

The browser never talks to FastAPI and never sees the JWT. Next.js API
routes log in to FastAPI, keep the token in an httpOnly cookie, and forward
API calls with the Bearer token. `PIKVA_API_URL` is server-only.
