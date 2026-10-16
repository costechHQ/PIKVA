"""Unit tests for the email notification service (SRS 20, 21.3, 28)."""

import json
import logging

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services import notification_service
from app.services.notification_service import (
    EmailMessage,
    LogEmailSender,
    ResendEmailSender,
    get_email_sender,
    send_email_safely,
)

MESSAGE = EmailMessage(
    to=("admin@example.com", "deputy@example.com"),
    subject="Pikva security alert: used_code",
    text="A pickup code was used twice.",
)


def resend_with(handler) -> ResendEmailSender:
    """Build a Resend sender that talks to a fake server instead of the internet."""

    return ResendEmailSender(
        api_key="re_test_key",
        sender="Pikva <alerts@example.com>",
        transport=httpx.MockTransport(handler),
    )


async def test_resend_sender_posts_message_with_bearer_key():
    """The Resend request carries the key, sender, recipients, subject and text."""

    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    assert await send_email_safely(MESSAGE, resend_with(handler)) is True

    [request] = requests
    assert str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer re_test_key"
    assert json.loads(request.content) == {
        "from": "Pikva <alerts@example.com>",
        "to": ["admin@example.com", "deputy@example.com"],
        "subject": "Pikva security alert: used_code",
        "text": "A pickup code was used twice.",
    }


async def test_rejected_email_is_logged_without_secrets(caplog):
    """A Resend error returns False and logs only the status code."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"message": "invalid from address"})

    with caplog.at_level(logging.ERROR):
        assert await send_email_safely(MESSAGE, resend_with(handler)) is False

    assert "HTTP 422" in caplog.text
    for secret in ("re_test_key", "admin@example.com", "used twice"):
        assert secret not in caplog.text


async def test_rejection_logs_resend_error_code_but_never_its_message(caplog):
    """The sandbox refusal names Resend's code and a hint; its message (with an address) is dropped."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={
            "statusCode": 403,
            "name": "validation_error",
            "message": "You can only send testing emails to your own email address (owner@example.com).",
        })

    with caplog.at_level(logging.ERROR):
        assert await send_email_safely(MESSAGE, resend_with(handler)) is False

    assert "HTTP 403 (validation_error)" in caplog.text
    assert "verified in Resend" in caplog.text
    assert "owner@example.com" not in caplog.text
    assert "testing emails" not in caplog.text


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="<html>Internal error</html>"),
        httpx.Response(400, json=["not", "an", "object"]),
        httpx.Response(400, json={"name": "Contact owner@example.com"}),
        httpx.Response(400, json={"name": 42}),
    ],
    ids=["not-json", "list", "name-with-text", "name-not-text"],
)
def test_odd_error_bodies_log_unknown(response):
    """Anything but a short code is reported as unknown."""

    assert notification_service.resend_error_name(response) == "unknown"


async def test_network_failure_never_raises(caplog):
    """A network error is caught and logged by type only."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with caplog.at_level(logging.ERROR):
        assert await send_email_safely(MESSAGE, resend_with(handler)) is False

    assert "ConnectError" in caplog.text


async def test_log_sender_records_subject_and_count_only(caplog):
    """Without Resend, the email is logged but its body and addresses are not.

    Logging is not delivery, so it reports not sent.
    """

    with caplog.at_level(logging.INFO):
        assert await send_email_safely(MESSAGE, LogEmailSender()) is False

    assert "Pikva security alert: used_code" in caplog.text
    assert "2 recipient(s)" in caplog.text
    assert "admin@example.com" not in caplog.text
    assert "used twice" not in caplog.text


async def test_message_without_recipients_is_skipped():
    """Nothing is sent when there is nobody to send to."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not be called")

    empty = EmailMessage(to=(), subject="s", text="t")

    assert await send_email_safely(empty, resend_with(handler)) is False


def test_sender_choice_follows_configuration(monkeypatch):
    """Resend is used only when both the key and from-address are set."""

    monkeypatch.setattr(settings, "resend_api_key", None)
    monkeypatch.setattr(settings, "email_from", "Pikva <alerts@example.com>")
    assert isinstance(get_email_sender(), LogEmailSender)

    monkeypatch.setattr(settings, "resend_api_key", SecretStr("re_live_key"))
    monkeypatch.setattr(settings, "email_from", None)
    assert isinstance(get_email_sender(), LogEmailSender)

    monkeypatch.setattr(settings, "email_from", "Pikva <alerts@example.com>")
    assert isinstance(get_email_sender(), ResendEmailSender)


def test_api_key_is_hidden_when_settings_are_printed(monkeypatch):
    """The key never appears in the settings' printed form."""

    monkeypatch.setattr(settings, "resend_api_key", SecretStr("re_live_key"))

    assert "re_live_key" not in repr(settings)
    assert "re_live_key" not in str(settings.resend_api_key)
    assert notification_service.settings is settings


def test_tests_never_use_real_resend():
    """The test setup disables Resend even if .env configures it."""

    assert settings.resend_api_key is None
    assert isinstance(get_email_sender(), LogEmailSender)
