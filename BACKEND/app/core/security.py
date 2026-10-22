import asyncio

from pwdlib import PasswordHash
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt

from app.core.config import settings
from app.core.constants import PICKUP_CODE_ALPHABET, PICKUP_CODE_LENGTH
from app.models.user import UserRole

password_hash = PasswordHash.recommended()

async def hash_password(password: str) -> str:
    """Hash a plain-text password securely.

    Argon2 is deliberately slow CPU work, so it runs in a worker thread to
    keep the event loop free for other requests (such as the gate).
    """

    return await asyncio.to_thread(password_hash.hash, password)


async def unusable_password_hash() -> str:
    """Hash a random secret nobody is told, for accounts awaiting setup.

    A normal Argon2 hash, so login treats it like any wrong password; the
    owner sets a real password through the emailed link (SRS 6.7).
    """

    return await hash_password(secrets.token_urlsafe(32))


async def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its stored hash, off the event loop."""

    return await asyncio.to_thread(password_hash.verify, password, hashed_password)


# Made on first use by the current hasher, so it costs the same to verify as
# a real user's hash.
_dummy_hash: str | None = None


async def verify_dummy_password(password: str) -> None:
    """Do a real-cost verify for a login with an unknown email.

    Without it, unknown emails fail faster than wrong passwords, and the
    response time would reveal which emails have accounts.
    """

    global _dummy_hash

    if _dummy_hash is None:
        _dummy_hash = await hash_password(secrets.token_urlsafe(16))

    await verify_password(password, _dummy_hash)

@dataclass(frozen=True)
class SessionLimits:
    """How long a session may sit idle, and how old it may ever get (SRS 6.10)."""

    idle: timedelta
    max_age: timedelta


def session_limits(role: UserRole) -> SessionLimits:
    """Return the session limits for a role.

    Parents use their own phones, so theirs are longer. Every other role is
    staff, so a role added later gets the short limits until it is decided.
    """

    if role == UserRole.PARENT:
        return SessionLimits(
            idle=timedelta(minutes=settings.session_idle_minutes_parent),
            max_age=timedelta(days=settings.session_max_days_parent),
        )

    return SessionLimits(
        idle=timedelta(minutes=settings.access_token_expire_minutes),
        max_age=timedelta(hours=settings.session_max_hours_staff),
    )


def create_access_token(
        subject: str,
        role: UserRole,
        auth_time: datetime | None = None,
        now: datetime | None = None,
) -> str:
    """Create a signed JWT access token for a user (SRS 6.4, 6.10).

    auth_time is when the user last entered their password: omit it for a
    sign-in, pass the old token's value when renewing so it never resets.
    The token expires after the idle limit, but never later than the
    maximum age counted from auth_time. now is for tests only.
    """

    issued_at = now or datetime.now(timezone.utc)
    signed_in_at = auth_time or issued_at
    limits = session_limits(role)

    # iat lets a password reset reject every token issued before it. PyJWT
    # turns iat and exp into whole seconds itself, but not a custom claim.
    payload = {
        "sub": subject,
        "iat": issued_at,
        "auth_time": int(signed_in_at.timestamp()),
        "exp": min(issued_at + limits.idle, signed_in_at + limits.max_age),
    }

    return jwt.encode(payload, settings.secret_key, algorithm="HS256")

def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT access token."""

    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
    )

# Separate key for pickup codes, derived from SECRET_KEY, so the JWT signer
# and the code hasher never share the same key.
_pickup_code_key = hmac.new(
    settings.secret_key.encode(),
    b"pikva:pickup-code",
    hashlib.sha256,
).digest()

def generate_pickup_code() -> str:
    """Generate a cryptographically random plaintext daily pickup code."""

    return "".join(
        secrets.choice(PICKUP_CODE_ALPHABET) for _ in range(PICKUP_CODE_LENGTH)
    )

def hash_pickup_code(code: str) -> str:
    """Return the keyed HMAC-SHA256 hex digest of a normalised pickup code."""

    normalised = "".join(code.split()).upper()

    return hmac.new(
        _pickup_code_key,
        normalised.encode(),
        hashlib.sha256,
    ).hexdigest()

def generate_password_reset_token() -> str:
    """Generate a random, URL-safe password reset token (32 bytes)."""

    return secrets.token_urlsafe(32)

def hash_password_reset_token(token: str) -> str:
    """Return the SHA-256 hex digest stored in place of a reset token.

    The token is 32 random bytes, so it cannot be guessed and a fast,
    unkeyed hash is enough (unlike passwords or 8-character pickup codes).
    """

    return hashlib.sha256(token.encode()).hexdigest()
