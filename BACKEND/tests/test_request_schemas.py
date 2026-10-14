"""Request schemas must reject missing fields, never fill them in (SRS 6.2, 21.1)."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import SchoolUserCreate, UserLogin, UserRegister
from app.schemas.pupil import PupilCreate

COMPLETE = {
    UserRegister: {
        "name": "Ada Admin",
        "email": "ada@example.com",
        "phone": "0700000000",
        "password": "a-strong-password",
        "school_name": "Sunrise School",
        "school_address": "1 School Road",
    },
    UserLogin: {"email": "ada@example.com", "password": "a-strong-password"},
    SchoolUserCreate: {
        "name": "Bayo Parent",
        "email": "bayo@example.com",
        "phone": "0711111111",
        "role": "parent",
    },
    PupilCreate: {"first_name": "Chidi", "last_name": "Eze", "date_of_birth": "2018-05-05"},
}

CASES = [(schema, field) for schema, body in COMPLETE.items() for field in body]


@pytest.mark.parametrize(("schema", "field"), CASES, ids=lambda v: getattr(v, "__name__", v))
def test_missing_field_is_rejected(schema, field):
    """Leaving out any required field is a validation error, not a default."""

    body = {key: value for key, value in COMPLETE[schema].items() if key != field}

    with pytest.raises(ValidationError):
        schema.model_validate(body)


@pytest.mark.parametrize("schema", list(COMPLETE), ids=lambda s: s.__name__)
def test_complete_body_is_accepted(schema):
    """A complete body still validates."""

    schema.model_validate(COMPLETE[schema])


def test_examples_still_documented_for_swagger():
    """Example values stay visible in the API docs."""

    properties = UserRegister.model_json_schema()["properties"]

    assert properties["email"]["examples"]
    assert "default" not in properties["password"]


async def test_register_with_empty_body_is_rejected(client):
    """Registering with no data creates nothing."""

    response = await client.post("/api/v1/auth/register", json={})

    assert response.status_code == 422
