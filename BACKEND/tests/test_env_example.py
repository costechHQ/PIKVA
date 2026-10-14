"""Tests that .env.example lists exactly the settings the app reads (SRS 26)."""

from pathlib import Path

from app.core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parent.parent / ".env.example"


def example_values() -> dict[str, str]:
    """Return the variables set in .env.example, ignoring comments and blanks."""

    lines = ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()
    pairs = (line.split("=", 1) for line in lines if line.strip() and not line.startswith("#"))

    return {name.strip(): value.strip() for name, value in pairs}


def test_env_example_matches_settings():
    """Every setting is documented, and nothing unknown is listed."""

    assert set(example_values()) == {name.upper() for name in Settings.model_fields}


def test_env_example_holds_no_real_secret():
    """The secret values are left empty in the committed example."""

    values = example_values()

    assert values["SECRET_KEY"] == ""
    assert values["RESEND_API_KEY"] == ""
