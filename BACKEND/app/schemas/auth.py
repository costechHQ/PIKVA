from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from app.models.user import UserRole
from app.schemas.fields import Address, Name, Password, Phone, ResetToken

# Examples only document the API in Swagger; they are never used as values,
# so a missing field is always rejected (SRS 6.2, 21.1).


class UserRegister(BaseModel):
    """Define the data required to register a Pikva user."""

    name: Name = Field(examples=["Ada Obi"])
    email: EmailStr = Field(examples=["admin@sunrise-school.example"])
    phone: Phone = Field(examples=["08012345678"])
    password: Password = Field(examples=["choose-a-strong-password"])
    school_name: Name = Field(examples=["Sunrise School"])
    school_address: Address = Field(examples=["Enugu, Enugu State"])

class UserResponse(BaseModel):
    """Define the safe user data retured by the API"""

    id: int
    school_id: int
    name: str
    email: EmailStr
    phone: str
    role: str


class SchoolUserResponse(UserResponse):
    """Define a school user as admins see them (SRS 6.7), including whether they are active."""

    is_active: bool


class CurrentUserResponse(UserResponse):
    """Define the signed-in user and their school, for client role routing."""

    school_name: str


class UserLogin(BaseModel):
    """Define the credentials required to log in"""

    email: EmailStr = Field(examples=["admin@sunrise-school.example"])
    password: Password = Field(examples=["choose-a-strong-password"])

class TokenResponse(BaseModel):
    """Define the access token return after login."""

    access_token: str
    token_type: str


class SchoolUserCreate(BaseModel):
    """Define the data required to create a user within a school (SRS 6.7).

    No password: the new user sets one through the emailed link. Unknown
    fields are rejected, so a client still sending "password" gets a 422
    instead of having it silently ignored.
    """

    model_config = ConfigDict(extra="forbid")

    name: Name = Field(examples=["Bayo Adeyemi"])
    email: EmailStr = Field(examples=["parent@sunrise-school.example"])
    phone: Phone = Field(examples=["07000000000"])
    role: UserRole


class SchoolUserUpdate(BaseModel):
    """Define the details an admin may change on a school user (SRS 6.7).

    Only name, email and phone; role and password are never changed here,
    and unknown fields are rejected.
    """

    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    email: EmailStr | None = None
    phone: Phone | None = None

    @model_validator(mode="after")
    def reject_nulls(self) -> "SchoolUserUpdate":
        """Reject an explicit null; leave a field out to keep it."""

        null_fields = sorted(field for field in self.model_fields_set if getattr(self, field) is None)
        if null_fields:
            raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}")
        return self


class OwnDetailsUpdate(BaseModel):
    """Define the details a user may change on their own account (SRS 6.9).

    Name and phone only: the email is the sign-in identity. Unknown fields
    (such as email or role) are rejected.
    """

    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    phone: Phone | None = None

    @model_validator(mode="after")
    def reject_nulls(self) -> "OwnDetailsUpdate":
        """Reject an explicit null; leave a field out to keep it."""

        null_fields = sorted(field for field in self.model_fields_set if getattr(self, field) is None)
        if null_fields:
            raise ValueError(f"Fields cannot be null: {', '.join(null_fields)}")
        return self


class PasswordChange(BaseModel):
    """Define a signed-in user's password change (SRS 6.8)."""

    current_password: Password = Field(examples=["the-current-password"])
    new_password: Password = Field(examples=["choose-a-new-strong-password"])

    @model_validator(mode="after")
    def require_a_different_password(self) -> "PasswordChange":
        """Reject a "change" to the same password."""

        if self.new_password == self.current_password:
            raise ValueError("The new password must be different from the current one")
        return self


class PasswordResetEmail(BaseModel):
    """Define the email that asks for a password reset link (SRS 6.6)."""

    email: EmailStr = Field(examples=["admin@sunrise-school.example"])


class PasswordResetConfirm(BaseModel):
    """Define the emailed reset token and the new password (SRS 6.6)."""

    token: ResetToken = Field(examples=["token-from-the-emailed-link"])
    new_password: Password = Field(examples=["choose-a-strong-password"])


class MessageResponse(BaseModel):
    """Define a plain message for the user."""

    detail: str
