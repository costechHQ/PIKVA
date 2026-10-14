import asyncio

from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt

from app.core.config import settings
from app.core.constants import PICKUP_CODE_ALPHABET, PICKUP_CODE_LENGTH

password_hash = PasswordHash.recommended()

async def hash_password(password: str) -> str:
    """Hash a plain-text password securely.

    Argon2 is deliberately slow CPU work, so it runs in a worker thread to
    keep the event loop free for other requests (such as the gate).
    """

    return await asyncio.to_thread(password_hash.hash, password)


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

def create_access_token(subject: str) -> str:
    """Create a signed JWT access token for a user."""

    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    # iat lets a password reset reject every token issued before it.
    payload = {
        "sub": subject,
        "iat": issued_at,
        "exp": expires_at,
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
