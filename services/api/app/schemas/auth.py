from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    surname: str
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
