"""Unit tests for daily pickup code generation and hashing (SRS 10.1, 23.5)."""

import re

from app.core.constants import PICKUP_CODE_ALPHABET, PICKUP_CODE_LENGTH
from app.core.security import generate_pickup_code, hash_pickup_code


def test_generated_code_has_expected_length_and_alphabet():
    """Codes are 8 characters drawn only from the unambiguous alphabet."""

    for _ in range(200):
        code = generate_pickup_code()

        assert len(code) == PICKUP_CODE_LENGTH
        assert set(code) <= set(PICKUP_CODE_ALPHABET)


def test_alphabet_excludes_ambiguous_characters():
    """The alphabet has no 0/O/1/I and exactly 32 unique characters."""

    assert not set("0O1I") & set(PICKUP_CODE_ALPHABET)
    assert len(set(PICKUP_CODE_ALPHABET)) == len(PICKUP_CODE_ALPHABET) == 32


def test_generated_codes_are_not_repeated():
    """Codes are random, so a batch of them contains no duplicates."""

    codes = {generate_pickup_code() for _ in range(1000)}

    assert len(codes) == 1000


def test_hash_is_deterministic_hex_digest():
    """The same code always hashes to the same 64-character hex digest."""

    code = generate_pickup_code()

    assert hash_pickup_code(code) == hash_pickup_code(code)
    assert re.fullmatch(r"[0-9a-f]{64}", hash_pickup_code(code))


def test_hash_normalises_case_and_whitespace():
    """Lowercase or spaced manual entry matches the issued code."""

    assert hash_pickup_code("abcd 2345") == hash_pickup_code("ABCD2345")
    assert hash_pickup_code(" ABCD2345\n") == hash_pickup_code("ABCD2345")


def test_different_codes_have_different_hashes():
    """Distinct codes never share a hash."""

    assert hash_pickup_code("ABCD2345") != hash_pickup_code("ABCD2346")


def test_hash_does_not_contain_plaintext():
    """The stored representation never reveals the plaintext code."""

    code = generate_pickup_code()

    assert code.lower() not in hash_pickup_code(code)
    assert code not in hash_pickup_code(code)
