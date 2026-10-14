"""Tests for application logging setup (SRS 27 "appropriate logging", 28)."""

import io
import logging

import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.logging_config import configure_logging
from app.main import create_app


@pytest.fixture(autouse=True)
def restore_app_logger():
    """Put the app logger's handlers and level back after each test."""

    logger = logging.getLogger("app")
    handlers, level = list(logger.handlers), logger.level

    yield

    logger.handlers[:] = handlers
    logger.setLevel(level)


def test_log_level_defaults_to_info():
    """Without LOG_LEVEL set, the app logs at INFO."""

    assert Settings.model_fields["log_level"].default == "INFO"


def test_unknown_log_level_is_rejected():
    """A typo in LOG_LEVEL fails at startup."""

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql+asyncpg://user@localhost/db",
            secret_key="x" * 64,
            log_level="LOUD",
        )


def test_info_lines_are_written_with_time_level_and_source():
    """App INFO lines are no longer dropped, and say when, how bad and where."""

    stream = io.StringIO()
    configure_logging("INFO", stream=stream)

    logging.getLogger("app.services.example").info("Something happened: %d", 3)

    line = stream.getvalue()
    assert " INFO app.services.example: Something happened: 3" in line
    assert line[:4].isdigit()  # starts with the date


def test_level_filters_lower_messages():
    """At WARNING, INFO lines are not written."""

    stream = io.StringIO()
    configure_logging("WARNING", stream=stream)

    logging.getLogger("app.example").info("quiet")
    logging.getLogger("app.example").warning("loud")

    assert "quiet" not in stream.getvalue()
    assert "loud" in stream.getvalue()


def test_configuring_twice_does_not_duplicate_lines():
    """Building the app again replaces the handler instead of adding another."""

    stream = io.StringIO()
    configure_logging("INFO", stream=io.StringIO())
    configure_logging("INFO", stream=stream)

    logging.getLogger("app.example").info("once")

    assert stream.getvalue().count("once") == 1


def test_create_app_applies_log_level(monkeypatch):
    """The app is built with the configured LOG_LEVEL."""

    monkeypatch.setattr(settings, "log_level", "DEBUG")

    create_app()

    assert logging.getLogger("app").level == logging.DEBUG
