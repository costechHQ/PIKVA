"""Tests that the suite hashes passwords cheaply without weakening production hashes."""

from pwdlib import PasswordHash

from app.core.security import hash_password, verify_password

PASSWORD = "TestPassword123!"


def test_tests_use_cheap_argon2():
    """conftest swaps in minimal Argon2 settings to keep the suite fast."""

    hashed = hash_password(PASSWORD)

    assert hashed.startswith("$argon2id$v=19$m=8,t=1,p=1$")
    assert verify_password(PASSWORD, hashed)


def test_production_strength_hash_still_verifies():
    """A hash made with production settings verifies, since Argon2 stores its settings."""

    strong = PasswordHash.recommended().hash(PASSWORD)

    assert "$m=65536,t=3,p=4$" in strong
    assert verify_password(PASSWORD, strong)
    assert not verify_password("WrongPassword123!", strong)
