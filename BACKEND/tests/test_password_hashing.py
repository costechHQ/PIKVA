"""Tests that the suite hashes passwords cheaply without weakening production hashes."""

import asyncio
import time

from pwdlib import PasswordHash

import test_pickup_code_api as api
from app.core import security
from app.core.security import hash_password, verify_password

PASSWORD = "TestPassword123!"
BLOCK_SECONDS = 0.3


async def test_tests_use_cheap_argon2():
    """conftest swaps in minimal Argon2 settings to keep the suite fast."""

    hashed = await hash_password(PASSWORD)

    assert hashed.startswith("$argon2id$v=19$m=8,t=1,p=1$")
    assert await verify_password(PASSWORD, hashed)


async def test_production_strength_hash_still_verifies():
    """A hash made with production settings verifies, since Argon2 stores its settings."""

    strong = PasswordHash.recommended().hash(PASSWORD)

    assert "$m=65536,t=3,p=4$" in strong
    assert await verify_password(PASSWORD, strong)
    assert not await verify_password("WrongPassword123!", strong)


class SlowHasher:
    """Wrap a hasher so each call blocks its thread, like production Argon2."""

    def __init__(self, inner):
        """Keep the real hasher that does the work after the delay."""

        self.inner = inner

    def hash(self, password: str) -> str:
        """Block, then hash."""

        time.sleep(BLOCK_SECONDS)
        return self.inner.hash(password)

    def verify(self, password: str, hashed: str) -> bool:
        """Block, then verify."""

        time.sleep(BLOCK_SECONDS)
        return self.inner.verify(password, hashed)


async def longest_stall(stop: asyncio.Event) -> float:
    """Tick every 10 ms until stopped; return the longest gap between ticks."""

    longest = 0.0
    last = time.perf_counter()

    while not stop.is_set():
        await asyncio.sleep(0.01)
        now = time.perf_counter()
        longest = max(longest, now - last)
        last = now

    return longest


async def test_password_hashing_does_not_block_event_loop(client, monkeypatch):
    """Register, login and create-user hash off the event loop, so other requests keep running."""

    monkeypatch.setattr(security, "password_hash", SlowHasher(security.password_hash))
    stop = asyncio.Event()
    watcher = asyncio.create_task(longest_stall(stop))

    try:
        school = await api.create_school(client, "alpha")
    finally:
        stop.set()
        stall = await watcher

    assert school["headers"]["gate_staff"]
    assert stall < BLOCK_SECONDS / 2


class CountingHasher:
    """Wrap a hasher and count verify calls."""

    def __init__(self, inner):
        """Keep the real hasher and start counting at zero."""

        self.inner = inner
        self.verifies = 0

    def hash(self, password: str) -> str:
        """Hash without counting."""

        return self.inner.hash(password)

    def verify(self, password: str, hashed: str) -> bool:
        """Count, then verify."""

        self.verifies += 1
        return self.inner.verify(password, hashed)


async def test_unknown_email_costs_the_same_as_wrong_password(client, monkeypatch):
    """Both failed logins run one Argon2 verify, so timing cannot reveal accounts."""

    await api.create_school(client, "alpha")
    counter = CountingHasher(security.password_hash)
    monkeypatch.setattr(security, "password_hash", counter)
    responses = {}

    for case, email in (("wrong password", "admin-alpha@example.com"),
                        ("unknown email", "nobody@example.com")):
        before = counter.verifies
        responses[case] = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "WrongPassword123!"}
        )
        assert counter.verifies - before == 1, case

    assert responses["wrong password"].status_code == 401
    assert responses["unknown email"].json() == responses["wrong password"].json()
