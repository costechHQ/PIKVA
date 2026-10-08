from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    """Define the data required to register a Pikva user."""

    name: str
    email: EmailStr
    phone: str
    password: str
    school_name: str
    school_address: str