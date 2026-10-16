import logging
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10

# Resend's error codes are short snake_case words; anything else is not logged.
_ERROR_NAME = re.compile(r"[a-z_]{1,50}")


@dataclass(frozen=True)
class EmailMessage:
    """Define a plain-text email. It must never contain secrets (SRS 20)."""

    to: tuple[str, ...]
    subject: str
    text: str


class EmailSender(Protocol):
    """Define anything that can deliver an email message."""

    async def send(self, message: EmailMessage) -> None:
        """Deliver the message or raise an exception."""


class LogEmailSender:
    """Record that an email would be sent, without sending it.

    Used when Resend is not configured (local development and tests). Only
    the subject and recipient count are logged, never addresses or body.
    """

    async def send(self, message: EmailMessage) -> None:
        """Log the email instead of sending it."""

        logger.info(
            "Email not sent (Resend not configured): %r to %d recipient(s)",
            message.subject,
            len(message.to),
        )


class ResendEmailSender:
    """Send email through the Resend HTTP API."""

    def __init__(
            self,
            api_key: str,
            sender: str,
            transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """Store the API key, from-address and optional test transport."""

        self._api_key = api_key
        self._sender = sender
        self._transport = transport

    async def send(self, message: EmailMessage) -> None:
        """Post the message to Resend and raise if it is not accepted."""

        async with httpx.AsyncClient(
            timeout=RESEND_TIMEOUT_SECONDS,
            transport=self._transport,
        ) as client:
            response = await client.post(
                RESEND_API_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "from": self._sender,
                    "to": list(message.to),
                    "subject": message.subject,
                    "text": message.text,
                },
            )

        response.raise_for_status()


def get_email_sender() -> EmailSender:
    """Return the Resend sender when configured, otherwise the log sender."""

    if settings.resend_api_key is None or not settings.email_from:
        return LogEmailSender()

    return ResendEmailSender(
        api_key=settings.resend_api_key.get_secret_value(),
        sender=settings.email_from,
    )


def resend_error_name(response: httpx.Response) -> str:
    """Return Resend's error code (such as validation_error), or "unknown".

    Only the short code is used, never Resend's message: it can contain
    email addresses (SRS 28).
    """

    try:
        name = response.json().get("name")
    except (ValueError, AttributeError):
        return "unknown"

    if isinstance(name, str) and _ERROR_NAME.fullmatch(name):
        return name

    return "unknown"


async def send_email_safely(
        message: EmailMessage,
        sender: EmailSender | None = None,
) -> bool:
    """Send an email without ever raising; return whether it was delivered.

    Failures are logged by error type and HTTP status only, so the API key,
    addresses and message content never reach the logs (SRS 28).
    """

    if not message.to:
        return False

    try:
        await (sender or get_email_sender()).send(message)

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        hint = " (is EMAIL_FROM on a domain verified in Resend?)" if status == 403 else ""
        logger.error("Email delivery failed: HTTP %d (%s)%s", status, resend_error_name(exc.response), hint)
        return False

    except Exception as exc:
        logger.error("Email delivery failed: %s", type(exc).__name__)
        return False

    return True
