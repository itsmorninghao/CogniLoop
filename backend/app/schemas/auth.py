"""Auth schemas."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)
    captcha_id: str
    captcha_answer: str


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_answer: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    avatar_url: str | None = None
    bio: str | None = None
    is_active: bool
    is_admin: bool
    is_superadmin: bool = False
    linux_do_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
