# Pikva API manual test guide

A start-to-finish walk through every endpoint (31 operations), in the order a
real school would use them. Each step says **who** calls it, **why**, the
command, and what you should see. Run the blocks in order in **one Git Bash
window**: later steps reuse IDs and tokens saved by earlier ones.

Every run creates its own tagged schools (`MT <tag> ...`), so it never touches
existing data. Section 14 removes them again.

## 0. Setup

Start the services (from `BACKEND/`), each in its own terminal:

```bash
docker compose up -d          # PostgreSQL (pikva-postgres) and Redis (pikva-redis)
uv run fastapi dev app/main.py
```

Then, in the window you will test from, paste this once:

```bash
BASE=http://127.0.0.1:8000/api/v1
TAG=mt$(date +%m%d%H%M%S)      # unique per run, so emails never clash
PW='ManualTest123!'
START=$(date -u -d '-5 minutes' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u -d '+30 days' +%Y-%m-%dT%H:%M:%SZ)
TOMORROW=$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)

# call METHOD PATH [TOKEN] [JSON]: prints the status and the JSON body.
call() {
  local args=(-s -o /tmp/pikva-last.json -D /tmp/pikva-headers.txt -w '%{http_code}' -X "$1" "$BASE$2")
  [ -n "$3" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "$4" ] && args+=(-H 'Content-Type: application/json' -d "$4")
  STATUS=$(curl "${args[@]}")
  echo "HTTP $STATUS"
  bun -e 'const t = await Bun.stdin.text(); try { console.log(JSON.stringify(JSON.parse(t), null, 2)) } catch { console.log(t) }' < /tmp/pikva-last.json
}

# last FIELD: read a field from the previous response, e.g. last .id
last() { bun -e "const d = JSON.parse(await Bun.stdin.text()); console.log(d$1)" < /tmp/pikva-last.json; }

# header NAME: show one header from the previous response
header() { grep -i "^$1:" /tmp/pikva-headers.txt; }

echo "Run tag: $TAG"
```

Tokens and passwords stay in shell variables; nothing here prints them.

**Roles used below:** *admin* (school admin), *parent*, *gate* (gate staff).

---

## 1. Health checks (public, no token)

**1.1 API is up.** `GET /health`
```bash
call GET /health
```
Expect `200 {"status": "ok"}`.

**1.2 Database reachable.** `GET /health/db`
```bash
call GET /health/db
```
Expect `200 {"database": "ok"}`.

**1.3 Redis reachable.** `GET /health/redis`
```bash
call GET /health/redis
```
Expect `200 {"redis": "ok"}`. (Section 13 shows the 503 case.)

---

## 2. Register a school and sign in

**2.1 Register a school and its first admin** (public). `POST /auth/register`
```bash
call POST /auth/register "" "$(cat <<JSON
{"name": "MT Admin", "email": "admin-$TAG@example.com", "phone": "0700000001",
 "password": "$PW", "school_name": "MT $TAG School", "school_address": "1 Test Road"}
JSON
)"
SCHOOL_ID=$(last .school_id); ADMIN_ID=$(last .id); echo "school $SCHOOL_ID, admin $ADMIN_ID"
```
Expect `201` with the user's `id`, `school_id`, `name`, `email`, `phone`,
`role: "school_admin"`. **No password or hash** in the response.

**2.2 Same email again** → conflict.
```bash
call POST /auth/register "" "$(cat <<JSON
{"name": "MT Admin", "email": "admin-$TAG@example.com", "phone": "0700000001",
 "password": "$PW", "school_name": "Another", "school_address": "1 Test Road"}
JSON
)"
```
Expect `409 {"detail": "A user with this email already exists"}`.

**2.3 Invalid input** → validation error (blank name, bad email).
```bash
call POST /auth/register "" '{"name": "  ", "email": "not-an-email", "phone": "1", "password": "x", "school_name": "S", "school_address": "A"}'
```
Expect `422` listing the `name` and `email` problems.

**2.4 Admin logs in.** `POST /auth/login`
```bash
call POST /auth/login "" "{\"email\": \"admin-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null
ADMIN=$(last .access_token); echo "admin token: ${#ADMIN} characters"
```
Expect `200 {"access_token": ..., "token_type": "bearer"}` (only its length is printed).

**2.5 Wrong password** → 401, same message whether or not the email exists.
```bash
call POST /auth/login "" "{\"email\": \"admin-$TAG@example.com\", \"password\": \"WrongPassword1!\"}"
call POST /auth/login "" '{"email": "nobody@example.com", "password": "WrongPassword1!"}'
```
Expect `401 {"detail": "Invalid email or password"}` both times.

**2.6 Who am I?** (any role) `GET /auth/me`
```bash
call GET /auth/me "$ADMIN"
```
Expect `200` with `id`, `school_id`, `name`, `email`, `phone`, `role: "school_admin"`, `school_name`.

**2.7 Missing or bad token** → 401.
```bash
call GET /auth/me
call GET /auth/me "not-a-real-token"
```
Expect `401 {"detail": "Not authenticated"}`, then `401 {"detail": "Invalid or expired token"}`.

**2.8 Auth checks.** `GET /health/auth` (any role), `GET /health/admin` (admin only)
```bash
call GET /health/auth "$ADMIN"
call GET /health/admin "$ADMIN"
```
Expect `200 {"authenticated": true, "user_id": ...}` and `200 {"authorized": true, "role": "school_admin"}`.

**2.9 Forgot password** (public). `POST /auth/password-reset/request`
```bash
call POST /auth/password-reset/request "" "{\"email\": \"admin-$TAG@example.com\"}"
call POST /auth/password-reset/request "" '{"email": "nobody@example.com"}'
```
Expect `202 {"detail": "If an account exists for that email, we have sent a link to reset its password."}`
**both times**: the answer never reveals which emails exist. Without Resend the
server log shows `Email not sent (Resend not configured): 'Reset your Pikva password'`
once (for the real account only), never the link.

**2.10 Make a known reset link** (dev database only). The emailed token cannot
be read from the log, so store one we know, exactly as the API would (only its
SHA-256 hash, valid 30 minutes).
```bash
RESET_TOKEN=$(openssl rand -hex 32)
RESET_HASH=$(printf %s "$RESET_TOKEN" | sha256sum | cut -d' ' -f1)
docker exec -i pikva-postgres psql -U postgres -d pikva -v ON_ERROR_STOP=1 <<SQL
INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
VALUES ($ADMIN_ID, '$RESET_HASH', now() + interval '30 minutes', now());
SQL
```
Expect `INSERT 0 1`.

**2.11 Set a new password with the link.** `POST /auth/password-reset/confirm`
```bash
NEW_PW='ManualTestReset456!'
call POST /auth/password-reset/confirm "" "{\"token\": \"$RESET_TOKEN\", \"new_password\": \"$NEW_PW\"}"
call GET /auth/me "$ADMIN"
call POST /auth/login "" "{\"email\": \"admin-$TAG@example.com\", \"password\": \"$PW\"}"
```
Expect `204` (no body), then `401` for the old session (a reset signs you out
everywhere), then `401` for the old password.

**2.12 A link works once; bad links fail.**
```bash
call POST /auth/password-reset/confirm "" "{\"token\": \"$RESET_TOKEN\", \"new_password\": \"$NEW_PW\"}"
call POST /auth/password-reset/confirm "" '{"token": "not-a-real-token", "new_password": "Whatever123!"}'
```
Expect `400 {"detail": "This reset link is invalid or has expired"}` both times.

**2.13 Sign in with the new password** (later steps reuse `$ADMIN`).
```bash
PW="$NEW_PW"
call POST /auth/login "" "{\"email\": \"admin-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null
ADMIN=$(last .access_token); echo "HTTP $STATUS, admin token: ${#ADMIN} characters"
call GET /auth/me "$ADMIN"
```
Expect `HTTP 200`, then `200` with the admin's details. `$PW` now holds the new
password, so the other accounts created below use it too.

---

## 3. The school and its users (admin)

**3.1 View the school.** `GET /schools/me`
```bash
call GET /schools/me "$ADMIN"
```
Expect `200` with the school's `id`, `name` (`MT <tag> School`) and `address`.

**3.2 Create a parent.** `POST /schools/users`
```bash
call POST /schools/users "$ADMIN" "$(cat <<JSON
{"name": "MT Parent", "email": "parent-$TAG@example.com", "phone": "0700000002",
 "password": "$PW", "role": "parent"}
JSON
)"
PARENT_ID=$(last .id); echo "parent $PARENT_ID"
```
Expect `201` with `role: "parent"` and the same `school_id`.

**3.3 Create gate staff.**
```bash
call POST /schools/users "$ADMIN" "$(cat <<JSON
{"name": "MT Gate", "email": "gate-$TAG@example.com", "phone": "0700000003",
 "password": "$PW", "role": "gate_staff"}
JSON
)"
GATE_ID=$(last .id); echo "gate $GATE_ID"
```
Expect `201` with `role: "gate_staff"`.

**3.4 Admins cannot create admins.**
```bash
call POST /schools/users "$ADMIN" "$(cat <<JSON
{"name": "MT Admin2", "email": "admin2-$TAG@example.com", "phone": "0700000004",
 "password": "$PW", "role": "school_admin"}
JSON
)"
```
Expect `409 {"detail": "School Admins can only create parents or gate staff"}`.

**3.5 Duplicate email** → conflict.
```bash
call POST /schools/users "$ADMIN" "$(cat <<JSON
{"name": "Copy", "email": "parent-$TAG@example.com", "phone": "0700000005",
 "password": "$PW", "role": "parent"}
JSON
)"
```
Expect `409`.

**3.6 List users**, all and by role. `GET /schools/users?role=&limit=&offset=`
```bash
call GET /schools/users "$ADMIN"
call GET "/schools/users?role=parent" "$ADMIN"
```
Expect three users (admin, parent, gate), then only the parent.

**3.7 Parent and gate sign in.**
```bash
call POST /auth/login "" "{\"email\": \"parent-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null
PARENT=$(last .access_token)
call POST /auth/login "" "{\"email\": \"gate-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null
GATE=$(last .access_token)
echo "parent token: ${#PARENT} chars, gate token: ${#GATE} chars"
```

**3.8 Roles are enforced.**
```bash
call GET /schools/users "$PARENT"
call GET /health/admin "$GATE"
```
Expect `403 {"detail": "You do not have permission to perform this action"}` both times.

---

## 4. Pupils

**4.1 Parent adds their child.** `POST /pupils` (parents never send `parent_id`)
```bash
call POST /pupils "$PARENT" '{"first_name": "Ada", "last_name": "Pupil", "date_of_birth": "2018-03-14"}'
PUPIL_ID=$(last .id); echo "pupil $PUPIL_ID"
```
Expect `201` with `parent_id` = the parent's ID and `school_id`.

**4.2 Parent may not choose a parent.**
```bash
call POST /pupils "$PARENT" "{\"first_name\": \"X\", \"last_name\": \"Y\", \"date_of_birth\": \"2018-01-01\", \"parent_id\": $ADMIN_ID}"
```
Expect `422 {"detail": "Parents cannot choose a parent for a pupil"}`.

**4.3 Admin adds a sibling for the parent** (admins must send `parent_id`).
```bash
call POST /pupils "$ADMIN" '{"first_name": "Ben", "last_name": "Pupil", "date_of_birth": "2020-07-01"}'
call POST /pupils "$ADMIN" "{\"first_name\": \"Ben\", \"last_name\": \"Pupil\", \"date_of_birth\": \"2020-07-01\", \"parent_id\": $PARENT_ID}"
SIBLING_ID=$(last .id); echo "sibling $SIBLING_ID"
```
Expect `422 {"detail": "parent_id is required"}`, then `201`.

**4.4 List and view.** `GET /pupils`, `GET /pupils/{id}`
```bash
call GET /pupils "$PARENT"
call GET /pupils/$PUPIL_ID "$ADMIN"
call GET /pupils/999999 "$ADMIN"
```
Expect both pupils, then Ada, then `404`.

**4.5 Update.** `PATCH /pupils/{id}` (send only what changes)
```bash
call PATCH /pupils/$PUPIL_ID "$PARENT" '{"first_name": "Adaeze"}'
call PATCH /pupils/$PUPIL_ID "$PARENT" '{"first_name": null}'
```
Expect `200` with `first_name: "Adaeze"`, then `422` (required fields cannot be cleared).

**4.6 Gate staff cannot browse pupils.**
```bash
call GET /pupils "$GATE"
```
Expect `403`.

---

## 5. Pickup authorisations (who may collect a pupil)

**5.1 Parent authorises a picker** (times need a timezone). `POST /pickers`
```bash
call POST /pickers "$PARENT" "$(cat <<JSON
{"pupil_id": $PUPIL_ID, "picker_name": "Grace Aunty", "picker_phone": "0700000009",
 "relationship": "aunt", "type": "regular", "starts_at": "$START", "expires_at": "$END"}
JSON
)"
AUTH_ID=$(last .id); echo "authorisation $AUTH_ID"
```
Expect `201` with `is_active: true` and `status: "active"`.

**5.2 A future authorisation** (used in 6.3).
```bash
call POST /pickers "$PARENT" "$(cat <<JSON
{"pupil_id": $PUPIL_ID, "picker_name": "Later Uncle", "picker_phone": "0700000010",
 "relationship": "uncle", "type": "temporary", "starts_at": "$TOMORROW", "expires_at": "$END"}
JSON
)"
SCHEDULED_ID=$(last .id)
```
Expect `201` with `status: "scheduled"`.

**5.3 Bad times are rejected.**
```bash
call POST /pickers "$PARENT" "{\"pupil_id\": $PUPIL_ID, \"picker_name\": \"N\", \"picker_phone\": \"1\", \"relationship\": \"r\", \"type\": \"t\", \"starts_at\": \"2026-01-01T08:00:00\", \"expires_at\": \"$END\"}"
call POST /pickers "$PARENT" "{\"pupil_id\": $PUPIL_ID, \"picker_name\": \"N\", \"picker_phone\": \"1\", \"relationship\": \"r\", \"type\": \"t\", \"starts_at\": \"$END\", \"expires_at\": \"$START\"}"
```
Expect `422` (no timezone), then `422 {"detail": "Expiry time must be after start time"}`.

**5.4 Only parents create authorisations.**
```bash
call POST /pickers "$ADMIN" "{\"pupil_id\": $PUPIL_ID, \"picker_name\": \"N\", \"picker_phone\": \"1\", \"relationship\": \"r\", \"type\": \"t\", \"starts_at\": \"$START\", \"expires_at\": \"$END\"}"
```
Expect `403`.

**5.5 List, view, update.** `GET /pickers?pupil_id=`, `GET /pickers/{id}`, `PATCH /pickers/{id}`
```bash
call GET "/pickers?pupil_id=$PUPIL_ID" "$PARENT"
call GET /pickers/$AUTH_ID "$ADMIN"
call PATCH /pickers/$AUTH_ID "$PARENT" '{"relationship": "aunt (mother'"'"'s sister)"}'
```
Expect both authorisations, then one, then `200` with the new relationship.

---

## 6. Daily pickup codes (parent)

**6.1 Request today's code.** `POST /pickup/codes`
```bash
call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $AUTH_ID}"
OLD_CODE=$(last .code)
```
Expect `201` with `code` (8 characters), `code_date`, `expires_at` (next
midnight UTC) and `qr_data`. **The plaintext code is shown only this once**;
only its hash is stored.

**6.2 Request again**: the new code replaces the old one.
```bash
call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $AUTH_ID}" > /dev/null
CODE=$(last .code); QR=$(last .qr_data); echo "current code received (${#CODE} chars)"
```

**6.3 No code before an authorisation starts, or for unknown ones.**
```bash
call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $SCHEDULED_ID}"
call POST /pickup/codes "$PARENT" '{"authorisation_id": 999999}'
```
Expect `422 {"detail": "Pickup authorisation is scheduled"}`, then `404`.

**6.4 Only parents request codes.**
```bash
call POST /pickup/codes "$GATE" "{\"authorisation_id\": $AUTH_ID}"
```
Expect `403`.

---

## 7. At the gate: verify, then release (gate)

`verify` only checks and shows who is collecting; `release` re-checks and
records the hand-over. Failures never reveal pupil details and each one
raises a security alert.

**7.1 Unknown code.** `POST /pickup/verify`
```bash
call POST /pickup/verify "$GATE" '{"method": "manual", "code": "ZZZZ9999"}'
```
Expect `200 {"result": "invalid_code", "verified": false, "pupil": null, ...}`.

**7.2 The replaced code** from 6.1.
```bash
call POST /pickup/verify "$GATE" "{\"method\": \"manual\", \"code\": \"$OLD_CODE\"}"
```
Expect `200` with `result: "expired_code"`, `verified: false`.

**7.3 Today's code, typed in.**
```bash
call POST /pickup/verify "$GATE" "{\"method\": \"manual\", \"code\": \"$CODE\"}"
```
Expect `200` with `verified: true`, `result: "valid"`, the pupil (`id`,
names, `photo_url`), the authorisation (`picker_name`, `relationship`, ...)
and `code_expires_at`. Nothing is changed yet.

**7.4 Today's code, scanned as QR.**
```bash
QR_BODY=$(QR="$QR" bun -e 'console.log(JSON.stringify({method: "qr", qr_data: process.env.QR}))')
call POST /pickup/verify "$GATE" "$QR_BODY"
```
Expect `200`, `verified: true`.

**7.5 Code checked against the wrong child.**
```bash
call POST /pickup/verify "$GATE" "{\"method\": \"manual\", \"code\": \"$CODE\", \"pupil_id\": $SIBLING_ID}"
```
Expect `200`, `result: "wrong_pupil"`, `verified: false`.

**7.6 Mismatched input** (manual needs `code` only, QR needs `qr_data` only).
```bash
call POST /pickup/verify "$GATE" '{"method": "manual", "qr_data": "{}"}'
```
Expect `422`.

**7.7 Release the pupil.** `POST /pickup/release`
```bash
call POST /pickup/release "$GATE" "{\"method\": \"manual\", \"code\": \"$CODE\"}"
RELEASE_ID=$(last .release_id); echo "release $RELEASE_ID"
```
Expect `201` with `released: true`, `release_id`, `released_at`, pupil and picker.

**7.8 The same code cannot release twice.**
```bash
call POST /pickup/release "$GATE" "{\"method\": \"manual\", \"code\": \"$CODE\"}"
call POST /pickup/verify "$GATE" "{\"method\": \"manual\", \"code\": \"$CODE\"}"
```
Expect `200 released: false, result: "used_code"`, then `verified: false, result: "used_code"`.

**7.9 Only gate staff use the gate.**
```bash
call POST /pickup/verify "$PARENT" '{"method": "manual", "code": "ZZZZ9999"}'
```
Expect `403`.

---

## 8. Release history

**8.1 Admin sees the school; parent sees their own children.** `GET /releases?pupil_id=&limit=&offset=`
```bash
call GET /releases "$ADMIN"
call GET "/releases?pupil_id=$PUPIL_ID" "$PARENT"
```
Expect one release with `pupil`, `authorisation`, `verified_by` (the gate
user's id and name), `verification_method: "manual"`, `result: "released"`.

**8.2 Gate staff cannot read history.**
```bash
call GET /releases "$GATE"
```
Expect `403`.

---

## 9. Turning an authorisation off and on

**9.1 Deactivate.** `POST /pickers/{id}/deactivate` (parent or admin)
```bash
call POST /pickers/$AUTH_ID/deactivate "$ADMIN"
call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $AUTH_ID}"
```
Expect `200` with `is_active: false, status: "inactive"`, then
`422 {"detail": "Pickup authorisation is inactive"}`.

**9.2 Activate again.** `POST /pickers/{id}/activate`
```bash
call POST /pickers/$AUTH_ID/activate "$PARENT"
call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $AUTH_ID}" > /dev/null; echo "HTTP $STATUS"
```
Expect `200` with `status: "active"`, then `HTTP 201`.

---

## 10. Security alerts (admin)

Steps 7.1, 7.2, 7.5 and 7.8 raised alerts. With no Resend key, the alert
email is written to the server log instead of being sent; at most one email
per school every 10 minutes.

**10.1 Open alerts.** `GET /alerts?status=open|resolved&limit=&offset=`
```bash
call GET "/alerts?status=open" "$ADMIN"
ALERT_ID=$(last '[0].id'); echo "newest alert $ALERT_ID"
```
Expect six open alerts, newest first: `repeated_failed_attempts` (raised by
the gate user's fifth failure within 10 minutes), `used_code` twice,
`wrong_pupil`, `expired_code`, `invalid_code`. Each has `attempted_by` = the
gate user; ones tied to a known code also carry `pupil_id` and `authorisation_id`.

**10.2 One alert, then resolve it.** `GET /alerts/{id}`, `POST /alerts/{id}/resolve`
```bash
call GET /alerts/$ALERT_ID "$ADMIN"
call POST /alerts/$ALERT_ID/resolve "$ADMIN"
call POST /alerts/$ALERT_ID/resolve "$ADMIN"
```
Expect the alert with `status: "open"`; then `200` with `status: "resolved"`
and `resolved_at`; then `409 {"detail": "Security alert is already resolved"}`.

**10.3 Staff only.**
```bash
call GET /alerts "$GATE"
```
Expect `403`.

---

## 11. Audit log (admin)

**11.1 Everything that happened, newest first.** `GET /audit-logs?action=&entity_type=&entity_id=&limit=&offset=`
```bash
call GET "/audit-logs?limit=5" "$ADMIN"
call GET "/audit-logs?action=pupil.released" "$ADMIN"
```
Expect entries with `action`, `entity_type`, `entity_id`, `user` (the actor's
`id` and `name`), `metadata`, `created_at`. Actions you should find:
`user.created`, `pupil.created`, `pupil.updated`,
`pickup_authorisation.created|updated|activated|deactivated`,
`pickup_code.generated`, `pickup.verification_failed`, `pupil.released`,
`alert.resolved`. No codes, passwords or tokens appear in `metadata`.

---

## 12. Another school sees nothing (isolation)

**12.1 Register a second school and use its admin.**
```bash
call POST /auth/register "" "$(cat <<JSON
{"name": "MT Beta Admin", "email": "beta-$TAG@example.com", "phone": "0700000011",
 "password": "$PW", "school_name": "MT $TAG Beta School", "school_address": "2 Test Road"}
JSON
)"
BETA_SCHOOL_ID=$(last .school_id)
call POST /auth/login "" "{\"email\": \"beta-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null
BETA=$(last .access_token)
```

**12.2 The first school's records are invisible.**
```bash
call GET /pupils/$PUPIL_ID "$BETA"
call GET /pickers/$AUTH_ID "$BETA"
call GET /alerts/$ALERT_ID "$BETA"
call GET /releases "$BETA"
```
Expect `404`, `404`, `404`, then `200 []`.

---

## 13. Limits and outages

These steps block you on purpose for a while; the last block in this section
unblocks you.

**13.1 Code requests: 10 per parent per hour.** Failed requests count too, so
6.1, 6.2, both calls in 6.3, and 9.1–9.2 have already used 6. (6.4 does not
count: the role check rejects it first.)
```bash
for i in $(seq 1 8); do call POST /pickup/codes "$PARENT" "{\"authorisation_id\": $AUTH_ID}" > /dev/null; echo -n "$STATUS "; done; echo
header retry-after
```
Expect `201 201 201 201 429 429 429 429`, then `retry-after: <seconds>` (up to 3600).

**13.2 Gate: 30 verify/release calls per staff member per minute.**
```bash
for i in $(seq 1 31); do call POST /pickup/verify "$GATE" '{"method": "manual", "code": "ZZZZ9999"}' > /dev/null; echo -n "$STATUS "; done; echo
```
Expect `200` until the budget is spent, then `429`. Steps 7.1–7.8 used 9 calls,
so if you ran them within the last minute you will see about 21 `200`s.

**13.3 Login lock: 5 failed attempts per email per 15 minutes.**
```bash
for i in $(seq 1 6); do call POST /auth/login "" "{\"email\": \"locked-$TAG@example.com\", \"password\": \"WrongPassword1!\"}" > /dev/null; echo -n "$STATUS "; done; echo
```
Expect `401 401 401 401 401 429`. (A made-up email is used, so no real account is locked.)

**13.4 Redis down: the API keeps working (fail open).**
```bash
docker stop pikva-redis
call GET /health/redis
call POST /auth/login "" "{\"email\": \"admin-$TAG@example.com\", \"password\": \"$PW\"}" > /dev/null; echo "login: HTTP $STATUS"
docker start pikva-redis
```
Expect `503 {"redis": "unavailable"}`, then `login: HTTP 200`; the server log
shows `Rate limiter unavailable, allowing request`.

**13.5 Unblock yourself** (dev Redis only: clears rate-limit counters).
```bash
docker exec pikva-redis redis-cli --scan --pattern 'pikva:rl:*' | xargs -r docker exec -i pikva-redis redis-cli DEL
```

---

## 14. Clean up the test schools (optional)

Removes only the two schools made by this run, matched by both ID and name.
Check the preview first.

```bash
echo "Will remove schools $SCHOOL_ID and $BETA_SCHOOL_ID (tag $TAG)"
docker exec -i pikva-postgres psql -U postgres -d pikva -v ON_ERROR_STOP=1 <<SQL
SELECT id, name FROM schools
WHERE id IN ($SCHOOL_ID, $BETA_SCHOOL_ID) AND name LIKE 'MT $TAG %';
SQL
```

If the preview shows exactly those two schools, delete them:

```bash
docker exec -i pikva-postgres psql -U postgres -d pikva -v ON_ERROR_STOP=1 <<SQL
BEGIN;
CREATE TEMP TABLE doomed AS
  SELECT id FROM schools WHERE id IN ($SCHOOL_ID, $BETA_SCHOOL_ID) AND name LIKE 'MT $TAG %';
DELETE FROM security_alerts WHERE school_id IN (SELECT id FROM doomed);
DELETE FROM release_records WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id IN (SELECT id FROM doomed));
DELETE FROM daily_pickup_codes WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id IN (SELECT id FROM doomed));
DELETE FROM pickup_authorisations WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id IN (SELECT id FROM doomed));
DELETE FROM pupils WHERE school_id IN (SELECT id FROM doomed);
DELETE FROM audit_logs WHERE school_id IN (SELECT id FROM doomed);
DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE school_id IN (SELECT id FROM doomed));
DELETE FROM users WHERE school_id IN (SELECT id FROM doomed);
DELETE FROM schools WHERE id IN (SELECT id FROM doomed);
COMMIT;
SQL
```

Each line reports `DELETE <n>`. Run 13.5 too if you want to clear the counters.

---

## Endpoint index

| # | Method | Path | Who | Step |
|---|---|---|---|---|
| 1 | GET | `/health` | public | 1.1 |
| 2 | GET | `/health/db` | public | 1.2 |
| 3 | GET | `/health/redis` | public | 1.3, 13.4 |
| 4 | POST | `/auth/register` | public | 2.1–2.3, 12.1 |
| 5 | POST | `/auth/login` | public | 2.4, 2.5, 3.7, 13.3 |
| 6 | GET | `/auth/me` | any role | 2.6, 2.7 |
| 7 | GET | `/health/auth` | any role | 2.8 |
| 8 | GET | `/health/admin` | admin | 2.8, 3.8 |
| 9 | GET | `/schools/me` | admin | 3.1 |
| 10 | POST | `/schools/users` | admin | 3.2–3.5 |
| 11 | GET | `/schools/users` | admin | 3.6, 3.8 |
| 12 | POST | `/pupils` | parent, admin | 4.1–4.3 |
| 13 | GET | `/pupils` | parent, admin | 4.4, 4.6 |
| 14 | GET | `/pupils/{id}` | parent, admin | 4.4, 12.2 |
| 15 | PATCH | `/pupils/{id}` | parent, admin | 4.5 |
| 16 | POST | `/pickers` | parent | 5.1–5.4 |
| 17 | GET | `/pickers` | parent, admin | 5.5 |
| 18 | GET | `/pickers/{id}` | parent, admin | 5.5, 12.2 |
| 19 | PATCH | `/pickers/{id}` | parent, admin | 5.5 |
| 20 | POST | `/pickers/{id}/deactivate` | parent, admin | 9.1 |
| 21 | POST | `/pickers/{id}/activate` | parent, admin | 9.2 |
| 22 | POST | `/pickup/codes` | parent | 6.1–6.4, 9, 13.1 |
| 23 | POST | `/pickup/verify` | gate | 7.1–7.6, 7.8, 7.9, 13.2 |
| 24 | POST | `/pickup/release` | gate | 7.7, 7.8 |
| 25 | GET | `/releases` | parent, admin | 8.1, 8.2, 12.2 |
| 26 | GET | `/alerts` | admin | 10.1, 10.3 |
| 27 | GET | `/alerts/{id}` | admin | 10.2, 12.2 |
| 28 | POST | `/alerts/{id}/resolve` | admin | 10.2 |
| 29 | GET | `/audit-logs` | admin | 11.1 |
| 30 | POST | `/auth/password-reset/request` | public | 2.9 |
| 31 | POST | `/auth/password-reset/confirm` | public | 2.11, 2.12 |
