"""Shared request field types (SRS 21.1 "validate all input").

Each text limit matches its database column, so over-long input is a 422
instead of a database error. Text is trimmed and must not be blank.
"""

from typing import Annotated

from pydantic import StringConstraints


def _text(max_length: int) -> type[str]:
    """Return a trimmed, non-blank string type with a maximum length."""

    return Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length),
    ]


# users.name, schools.name, pickup_authorisations.picker_name: String(150)
Name = _text(150)

# pupils.first_name / last_name: String(100)
PupilName = _text(100)

# users.phone, pickup_authorisations.picker_phone: String(30)
Phone = _text(30)

# pickup_authorisations.relationship / type: String(50)
Label = _text(50)

# schools.address: String(255)
Address = _text(255)

# pupils.photo_url, pickup_authorisations.photo_url: String(500)
PhotoUrl = _text(500)

# Hashed, so no column limit; capped so huge inputs are never hashed.
# Not trimmed (spaces may be part of a password) but must not be all spaces.
Password = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"\S")]

# Password reset tokens: secrets.token_urlsafe(32) gives 43 URL-safe
# characters; capped so huge inputs are never hashed.
ResetToken = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
