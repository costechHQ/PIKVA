# Pikva backend deployment checklist

Covers SRS 27 (deployment), 28 (observability) and 21 (security). Work
through it top to bottom for every new environment; tick each line.

## 1. Services

- [ ] PostgreSQL 16 with its own database and a dedicated user (not a superuser).
- [ ] PostgreSQL reachable only from the API host (SRS 27 "restrict unauthorized access").
- [ ] Automated PostgreSQL backups, and one restore actually tested.
- [ ] Redis 7 reachable only from the API host, never from the internet.
      Redis holds only short-lived counters, so persistence is not needed.
- [ ] Python 3.14 and uv installed on the API host.

## 2. Configuration

Copy `.env.example` to `.env` (or set the same variables in the host's
secret store) and set:

- [ ] `ENVIRONMENT=production` (hides `/docs`, `/redoc`, `/openapi.json`; enforces the key check).
- [ ] `SECRET_KEY` generated with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
      The app refuses to start in production with a short, placeholder or low-variety key.
      Changing it later signs everyone out and invalidates pickup codes issued that day.
- [ ] `DATABASE_URL` with the production user and password.
- [ ] `REDIS_URL` pointing at the production Redis (database 0, never 15).
- [ ] `LOG_LEVEL=INFO`.
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` on a domain verified in Resend.
      `onboarding@resend.dev` only delivers to the Resend account owner.
- [ ] `.env` is not in git and is readable only by the service user.

## 3. Database migrations

- [ ] Back up the database first.
- [ ] From `BACKEND/`: `uv sync --frozen`, then `uv run alembic upgrade head`.
- [ ] `uv run alembic current` shows the head revision.

## 4. Running the API

- [ ] Start with `uv run fastapi run app/main.py --workers <N>` behind an HTTPS
      reverse proxy (SRS 27 "use HTTPS"). Do not expose port 8000 directly.
- [ ] Client IPs: `fastapi run` reads `X-Forwarded-For` only from trusted proxies,
      by default `127.0.0.1,::1`. If the proxy runs on another host, set
      `FORWARDED_ALLOW_IPS` to its address. Never use `*` unless the API is
      reachable only through the proxy, or clients can fake their IP and dodge
      the per-IP limits on login and registration.
- [ ] Sizing: each password hash or check uses about 64 MiB and 80 ms of CPU, in a
      worker thread (up to `min(32, CPUs + 4)` per worker process). Allow memory
      for bursts of logins: workers x threads x 64 MiB at worst.

## 5. Checks after starting

- [ ] `GET /api/v1/health` returns `{"status": "ok"}`.
- [ ] `GET /api/v1/health/db` returns `{"database": "ok"}`.
- [ ] `GET /api/v1/health/redis` returns `{"redis": "ok"}` (503 means Redis is unreachable).
- [ ] `GET /docs` and `GET /openapi.json` return 404.
- [ ] Log lines appear with time, level and source, and no `SECRET_KEY` warning.
- [ ] A test login over HTTPS works; a wrong password returns 401.

## 6. Monitoring

- [ ] Uptime monitoring on the three health endpoints.
- [ ] Alert on `/health/redis` failures: while Redis is down, rate limits and the
      alert-email cooldown are skipped (fail open, logged as warnings) so the gate keeps working.
- [ ] Logs collected and kept for a set period. They contain client IPs (personal
      data), user and school IDs, but never passwords, tokens, codes, names or emails (SRS 28).
- [ ] Watch for `Rate limit exceeded` and `Security alerts raised` warnings.

## Rate limits in force

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 30 attempts per IP and 5 failures per email, per 15 minutes |
| `POST /auth/register` | 5 per IP per hour |
| `POST /pickup/verify` and `/pickup/release` | 30 per gate staff member per minute, shared |
| `POST /pickup/codes` | 10 per parent per hour |
| Security alert emails | 1 per school per 10 minutes; repeated-attempts alerts always sent |

## Known limitations (accepted for now)

- Pickup codes expire at midnight UTC, not the school's local midnight
  (01:00 in UTC+1). Schools have no timezone setting yet.
- OpenAPI lists only success, 422, 429 and health 503 responses; the 401, 403,
  404 and 409 responses the routes return are not yet documented.
- Auditing of user role changes (SRS 14) waits for a role-change endpoint.
