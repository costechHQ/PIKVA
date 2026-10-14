from pydantic import BaseModel, EmailStr, Field
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
    """Define the data required to create a user within a school."""

    name: Name = Field(examples=["Bayo Adeyemi"])
    email: EmailStr = Field(examples=["parent@sunrise-school.example"])
    phone: Phone = Field(examples=["07000000000"])
    password: Password = Field(examples=["choose-a-strong-password"])
    role: UserRole


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
