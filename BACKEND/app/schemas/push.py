from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator

# The push services the major browsers use. A subscription's address is
# called by the server, so only these hosts are accepted: nobody can point
# the server at an internal address.
PUSH_SERVICE_HOSTS = (
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "notify.windows.com",
    "push.apple.com",
)

ENDPOINT_MAX_LENGTH = 2048
KEY_PATTERN = r"^[A-Za-z0-9_-]{1,255}$"


def push_endpoint_allowed(endpoint: str) -> bool:
    """Return whether an address is https and on a known push service."""

    try:
        parts = urlsplit(endpoint)
        host = parts.hostname
        port = parts.port
    except ValueError:
        return False

    if parts.scheme != "https" or not host or parts.username or parts.password or port not in (None, 443):
        return False

    return any(host == allowed or host.endswith("." + allowed) for allowed in PUSH_SERVICE_HOSTS)


def _check_endpoint(endpoint: str) -> str:
    if not push_endpoint_allowed(endpoint):
        raise ValueError("The push address is not from a supported push service")

    return endpoint


class PushKeys(BaseModel):
    """Define the keys a browser made for its push subscription."""

    p256dh: str = Field(pattern=KEY_PATTERN)
    auth: str = Field(pattern=KEY_PATTERN)


class PushSubscriptionCreate(BaseModel):
    """Define a browser's push subscription as the browser reports it."""

    endpoint: str = Field(max_length=ENDPOINT_MAX_LENGTH)
    keys: PushKeys

    _endpoint = field_validator("endpoint")(_check_endpoint)


class PushSubscriptionRemove(BaseModel):
    """Define which of the admin's own subscriptions to remove."""

    endpoint: str = Field(max_length=ENDPOINT_MAX_LENGTH)


class PushConfigResponse(BaseModel):
    """Define what the browser needs to subscribe; public_key is null when pushes are off."""

    public_key: str | None
