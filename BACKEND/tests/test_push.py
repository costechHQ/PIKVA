"""Tests for push notifications of new security alerts (SRS 13)."""

import json
from datetime import datetime, timezone

import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import select

import test_pickup_code_api as api
from app.core.config import settings
from app.db.session import async_session
from app.models.push_subscription import PushSubscription
from app.models.school import School
from app.models.security_alert import SecurityAlert
from app.models.user import User, UserRole
from app.schemas.push import PushSubscriptionCreate, push_endpoint_allowed
from app.services.push_service import (
    MAX_SUBSCRIPTIONS_PER_USER,
    alert_push_payload,
    get_push_sender,
    push_security_alerts,
    remove_subscription,
    save_subscription,
)

FCM = "https://fcm.googleapis.com/fcm/send/"
KEYS = {"p256dh": "BPubKey_-123", "auth": "AuthKey_-123"}


def body(endpoint: str) -> dict:
    return {"endpoint": endpoint, "keys": KEYS}


# --- The subscription address (no database) ---


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
        "https://web.push.apple.com/abc",
    ],
)
def test_known_push_services_are_accepted(endpoint):
    assert push_endpoint_allowed(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://localhost/abc",
        "https://127.0.0.1/abc",
        "https://169.254.169.254/latest/meta-data",
        "https://evil.example.com/fcm.googleapis.com",
        "https://fcm.googleapis.com.evil.example.com/abc",
        "https://user:pass@fcm.googleapis.com/abc",
        "https://fcm.googleapis.com:8443/abc",
        "ftp://fcm.googleapis.com/abc",
        "not a url",
        "",
    ],
)
def test_other_addresses_are_refused(endpoint):
    assert not push_endpoint_allowed(endpoint)


def test_subscription_schema_refuses_bad_keys():
    with pytest.raises(ValidationError):
        PushSubscriptionCreate(endpoint=FCM + "a", keys={"p256dh": "has space", "auth": "ok"})

    with pytest.raises(ValidationError):
        PushSubscriptionCreate(endpoint=FCM + "a", keys={"p256dh": "ok", "auth": ""})


def test_payload_holds_only_the_alert_message():
    one = SecurityAlert(id=1, school_id=1, alert_type="invalid_code", message="Pickup code was not recognised (qr verification)")
    two = SecurityAlert(id=2, school_id=1, alert_type="used_code", message="Pickup code has already been used (manual verification)")

    single = json.loads(alert_push_payload([one]))
    several = json.loads(alert_push_payload([one, two]))

    assert single["body"] == "Pickup code was not recognised (qr verification)"
    assert single["url"] == "/admin/alerts"
    assert "2 new security alerts" in several["body"]


def test_push_is_off_without_the_vapid_settings(monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", None)
    monkeypatch.setattr(settings, "vapid_private_key", None)
    monkeypatch.setattr(settings, "vapid_subject", None)

    assert get_push_sender() is None


# --- The routes ---


@pytest.fixture
async def school(client):
    return await api.create_school(client, "alpha")


async def stored_endpoints() -> list[str]:
    async with async_session() as session:
        return list((await session.scalars(select(PushSubscription.endpoint).order_by(PushSubscription.id))).all())


async def test_config_is_null_when_push_is_off(client, school, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", None)

    response = await client.get("/api/v1/push/config", headers=school["headers"]["admin"])

    assert response.status_code == 200
    assert response.json() == {"public_key": None}


async def test_config_gives_the_public_key_when_push_is_on(client, school, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "PUBLICKEY")
    monkeypatch.setattr(settings, "vapid_private_key", SecretStr("private"))
    monkeypatch.setattr(settings, "vapid_subject", "mailto:admin@example.com")

    response = await client.get("/api/v1/push/config", headers=school["headers"]["admin"])

    assert response.json() == {"public_key": "PUBLICKEY"}
    assert "private" not in response.text


async def test_admin_can_subscribe_once_per_browser(client, school):
    headers = school["headers"]["admin"]

    first = await client.post("/api/v1/push/subscriptions", headers=headers, json=body(FCM + "one"))
    again = await client.post("/api/v1/push/subscriptions", headers=headers, json=body(FCM + "one"))

    assert first.status_code == 204
    assert again.status_code == 204
    assert await stored_endpoints() == [FCM + "one"]


async def test_subscription_from_another_host_is_refused(client, school):
    response = await client.post(
        "/api/v1/push/subscriptions",
        headers=school["headers"]["admin"],
        json=body("https://169.254.169.254/latest"),
    )

    assert response.status_code == 422
    assert await stored_endpoints() == []


async def test_admin_can_unsubscribe(client, school):
    headers = school["headers"]["admin"]
    await client.post("/api/v1/push/subscriptions", headers=headers, json=body(FCM + "one"))

    response = await client.post("/api/v1/push/subscriptions/remove", headers=headers, json={"endpoint": FCM + "one"})

    assert response.status_code == 204
    assert await stored_endpoints() == []


async def test_subscription_never_appears_in_alert_responses(client, school):
    headers = school["headers"]["admin"]
    await client.post("/api/v1/push/subscriptions", headers=headers, json=body(FCM + "secret-endpoint"))

    response = await client.get("/api/v1/alerts", headers=headers)

    assert "secret-endpoint" not in response.text


# --- The service ---


async def make_school(session, name: str, admins: int = 1) -> tuple[School, list[User]]:
    school = School(name=f"{name} School", address="1 Test Road")
    session.add(school)
    await session.flush()

    users = [
        User(
            school_id=school.id,
            name=f"{name} Admin {number}",
            email=f"admin-{name.lower()}-{number}@example.com",
            phone="0700000000",
            password_hash="not-used",
            role=UserRole.SCHOOL_ADMIN,
        )
        for number in range(admins)
    ]
    session.add_all(users)
    await session.commit()

    return school, users


async def make_alert(session, school_id: int) -> SecurityAlert:
    alert = SecurityAlert(
        school_id=school_id,
        alert_type="invalid_code",
        message="Pickup code was not recognised (qr verification)",
        created_at=datetime.now(timezone.utc),
    )
    session.add(alert)
    await session.commit()

    return alert


class FakeSender:
    """Capture pushes; endpoints ending in -gone report gone and -down fail."""

    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send(self, target, payload):
        if target.endpoint.endswith("-down"):
            raise RuntimeError("push service down")

        if target.endpoint.endswith("-gone"):
            return False

        self.sent.append((target.endpoint, payload))
        return True


@pytest.fixture
async def session():
    async with async_session() as session:
        yield session


async def test_every_admin_browser_at_the_school_is_pushed(session):
    school, [first, second] = await make_school(session, "Alpha", admins=2)
    await save_subscription(session, first.id, FCM + "laptop", "k1", "a1")
    await save_subscription(session, first.id, FCM + "phone", "k2", "a2")
    await save_subscription(session, second.id, FCM + "other-admin", "k3", "a3")
    alert = await make_alert(session, school.id)
    sender = FakeSender()

    reached = await push_security_alerts(school.id, [alert.id], sender)

    assert reached == 3
    assert sorted(endpoint for endpoint, _ in sender.sent) == sorted(
        [FCM + "laptop", FCM + "phone", FCM + "other-admin"]
    )
    assert json.loads(sender.sent[0][1])["body"] == alert.message


async def test_another_schools_admins_are_not_pushed(session):
    school, _ = await make_school(session, "Alpha")
    other, [other_admin] = await make_school(session, "Beta")
    await save_subscription(session, other_admin.id, FCM + "beta-admin", "k", "a")
    alert = await make_alert(session, school.id)
    sender = FakeSender()

    assert await push_security_alerts(school.id, [alert.id], sender) == 0
    assert sender.sent == []


async def test_other_schools_alert_ids_push_nothing(session):
    school, [admin] = await make_school(session, "Alpha")
    other, _ = await make_school(session, "Beta")
    await save_subscription(session, admin.id, FCM + "alpha-admin", "k", "a")
    foreign_alert = await make_alert(session, other.id)
    sender = FakeSender()

    assert await push_security_alerts(school.id, [foreign_alert.id], sender) == 0


async def test_deactivated_admin_is_not_pushed(session):
    school, [admin] = await make_school(session, "Alpha")
    await save_subscription(session, admin.id, FCM + "laptop", "k", "a")
    admin.deactivated_at = datetime.now(timezone.utc)
    await session.commit()
    alert = await make_alert(session, school.id)
    sender = FakeSender()

    assert await push_security_alerts(school.id, [alert.id], sender) == 0


async def test_every_alert_is_pushed_with_no_cooldown(session):
    school, [admin] = await make_school(session, "Alpha")
    await save_subscription(session, admin.id, FCM + "laptop", "k", "a")
    first = await make_alert(session, school.id)
    second = await make_alert(session, school.id)
    sender = FakeSender()

    await push_security_alerts(school.id, [first.id], sender)
    await push_security_alerts(school.id, [second.id], sender)

    assert len(sender.sent) == 2


async def test_gone_subscription_is_deleted_and_the_rest_still_sent(session):
    school, [admin] = await make_school(session, "Alpha")
    await save_subscription(session, admin.id, FCM + "old-gone", "k", "a")
    await save_subscription(session, admin.id, FCM + "laptop", "k", "a")
    alert = await make_alert(session, school.id)
    sender = FakeSender()

    assert await push_security_alerts(school.id, [alert.id], sender) == 1
    assert await stored_endpoints() == [FCM + "laptop"]


async def test_a_failing_push_service_never_raises_or_loses_the_subscription(session):
    school, [admin] = await make_school(session, "Alpha")
    await save_subscription(session, admin.id, FCM + "flaky-down", "k", "a")
    await save_subscription(session, admin.id, FCM + "laptop", "k", "a")
    alert = await make_alert(session, school.id)
    sender = FakeSender()

    assert await push_security_alerts(school.id, [alert.id], sender) == 1
    assert await stored_endpoints() == [FCM + "flaky-down", FCM + "laptop"]


async def test_nothing_is_pushed_when_push_is_off(session, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", None)
    school, [admin] = await make_school(session, "Alpha")
    await save_subscription(session, admin.id, FCM + "laptop", "k", "a")
    alert = await make_alert(session, school.id)

    assert await push_security_alerts(school.id, [alert.id]) == 0


async def test_an_admin_keeps_at_most_ten_browsers(session):
    _, [admin] = await make_school(session, "Alpha")

    for number in range(MAX_SUBSCRIPTIONS_PER_USER + 2):
        await save_subscription(session, admin.id, f"{FCM}browser-{number}", "k", "a")

    endpoints = await stored_endpoints()
    assert len(endpoints) == MAX_SUBSCRIPTIONS_PER_USER
    assert f"{FCM}browser-0" not in endpoints
    assert f"{FCM}browser-{MAX_SUBSCRIPTIONS_PER_USER + 1}" in endpoints


async def test_a_browser_signed_in_as_someone_else_changes_owner(session):
    _, [first, second] = await make_school(session, "Alpha", admins=2)
    await save_subscription(session, first.id, FCM + "shared", "k", "a")
    await save_subscription(session, second.id, FCM + "shared", "k2", "a2")

    async with async_session() as check:
        rows = (await check.scalars(select(PushSubscription))).all()

    assert [(row.user_id, row.p256dh) for row in rows] == [(second.id, "k2")]


async def test_nobody_can_remove_another_admins_browser(session):
    _, [first, second] = await make_school(session, "Alpha", admins=2)
    await save_subscription(session, first.id, FCM + "mine", "k", "a")

    await remove_subscription(session, second.id, FCM + "mine")

    assert await stored_endpoints() == [FCM + "mine"]
