"""Create or remove a throwaway school for the web browser tests (FRONTEND/e2e).

    uv run python scripts/e2e_school.py create <state.json>
    uv run python scripts/e2e_school.py cleanup <state.json>

create writes a school tagged e2e-<hex> with an admin, a parent, a gate
staff member and one pupil straight into the configured database, and saves
their sign-in details to state.json (never printed). cleanup deletes only
that school's rows, children first, in one transaction, after checking the
school still carries the tag. Both refuse to run in production.
"""

import asyncio
import json
import secrets
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import async_session, engine  # noqa: E402
from app.models.pupil import Pupil  # noqa: E402
from app.models.school import School  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.photo_service import get_photo_storage  # noqa: E402

TAG_PREFIX = "e2e-"

PHOTO_KEYS = (
    "SELECT photo_key FROM pickup_authorisations WHERE photo_key IS NOT NULL"
    " AND pupil_id IN (SELECT id FROM pupils WHERE school_id = :id)"
)

# Children first, so no row is left pointing at a deleted one.
CLEANUP = (
    "DELETE FROM audit_logs WHERE school_id = :id",
    "DELETE FROM security_alerts WHERE school_id = :id",
    "DELETE FROM release_records WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id = :id)",
    "DELETE FROM daily_pickup_codes WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id = :id)",
    "DELETE FROM pickup_authorisations WHERE pupil_id IN (SELECT id FROM pupils WHERE school_id = :id)",
    "DELETE FROM pupils WHERE school_id = :id",
    "DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE school_id = :id)",
    "DELETE FROM users WHERE school_id = :id",
    "DELETE FROM schools WHERE id = :id",
)


async def create(state_path: Path) -> None:
    tag = f"{TAG_PREFIX}{secrets.token_hex(4)}"
    password = secrets.token_urlsafe(18)
    password_hash = await hash_password(password)

    async with async_session() as session:
        school = School(name=f"{tag} School", address="1 Test Road")
        session.add(school)
        await session.flush()

        people = {}
        for key, role, name in (
            ("admin", UserRole.SCHOOL_ADMIN, f"Ama Admin {tag}"),
            ("parent", UserRole.PARENT, f"Ngozi Parent {tag}"),
            ("gate", UserRole.GATE_STAFF, f"Sule Gate {tag}"),
        ):
            user = User(
                school_id=school.id,
                name=name,
                email=f"{key}-{tag}@example.com",
                phone="0700000000",
                password_hash=password_hash,
                role=role,
            )
            session.add(user)
            people[key] = user
        await session.flush()

        pupil = Pupil(
            school_id=school.id,
            parent_id=people["parent"].id,
            first_name="Ada",
            last_name=tag,
            date_of_birth=date(2018, 1, 1),
        )
        session.add(pupil)
        await session.flush()

        state = {
            "school_id": school.id,
            "tag": tag,
            "password": password,
            **{key: {"id": user.id, "name": user.name, "email": user.email} for key, user in people.items()},
            "pupil": {"id": pupil.id, "first_name": pupil.first_name, "last_name": pupil.last_name},
        }
        await session.commit()

    state_path.write_text(json.dumps(state, indent=2))
    print(f"created school {state['school_id']} ({tag})")


async def cleanup(state_path: Path) -> None:
    state = json.loads(state_path.read_text())
    school_id, tag = state["school_id"], state["tag"]

    async with async_session() as session:
        name = await session.scalar(text("SELECT name FROM schools WHERE id = :id"), {"id": school_id})
        if name is None:
            print(f"school {school_id} already removed")
            return
        if not tag.startswith(TAG_PREFIX) or name != f"{tag} School":
            raise SystemExit(f"refusing to clean up: school {school_id} is not the test school")

        # Uploaded photo files live outside the database (SRS 9.3).
        photo_keys = list(await session.scalars(text(PHOTO_KEYS), {"id": school_id}))

        counts = {}
        for statement in CLEANUP:
            counts[statement.split()[2]] = (await session.execute(text(statement), {"id": school_id})).rowcount
        await session.commit()

    storage = get_photo_storage()
    for key in photo_keys:
        await storage.delete(key)
    counts["photo_files"] = len(photo_keys)

    print(f"removed school {school_id} ({tag}): {json.dumps(counts)}")


async def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in {"create", "cleanup"}:
        raise SystemExit(__doc__)
    if settings.environment == "production":
        raise SystemExit("refusing to run: ENVIRONMENT is production")

    try:
        await (create if sys.argv[1] == "create" else cleanup)(Path(sys.argv[2]))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
