from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    """Define the data required to register a Pikva user."""

    name: str
    email: EmailStr
    phone: str
    password: str
    school_name: str
    school_address: str

class UserResponse(BaseModel):
    """Define the safe user data retured by the API"""

    id: int
    school_id: int
    name: str
    email: EmailStr
    phone: str
    role: str