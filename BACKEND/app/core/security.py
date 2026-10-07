from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
import jwt

from app.core.config import settings

password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    """"Hash a plain-text password securely"""

    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its stored hash."""

    return password_hash.verify(password, hashed_password)

def create_access_token(subject: str) -> str:
    """Create a signed JWT access token for a user."""

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": subject,
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