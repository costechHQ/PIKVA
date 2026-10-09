from pydantic import BaseModel, EmailStr
class UserRegister(BaseModel):
    """Define the data required to register a Pikva user."""

    name: str = "Pikva Admin"
    email: EmailStr = "admin2@pikvatest.com"
    phone: str = "08012345678"
    password: str = "TestPassword123"
    school_name: str = "Pikva Test School" 
    school_address: str = "Enugu, Enugu State"

class UserResponse(BaseModel):
    """Define the safe user data retured by the API"""

    id: int
    school_id: int
    name: str
    email: EmailStr
    phone: str
    role: str


class UserLogin(BaseModel):
    """Define the credentials required to log in"""

    email: EmailStr = "admin2@pikvatest.com"
    password: str = "TestPassword123"

class TokenResponse(BaseModel):
    """Define the access token return after login."""

    access_token: str
    token_type: str
