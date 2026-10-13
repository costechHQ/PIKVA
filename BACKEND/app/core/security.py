from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import jwt

from app.core.config import settings
from app.core.constants import PICKUP_CODE_ALPHABET, PICKUP_CODE_LENGTH

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
