"""认证相关的请求/响应模型"""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """注册请求"""

    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=100)
    captcha_id: str = Field(..., description="验证码 ID")
    captcha_value: str = Field(..., description="用户输入的验证码")


class LoginRequest(BaseModel):
    """登录请求"""

    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    captcha_id: str = Field(..., description="验证码 ID")
    captcha_value: str = Field(..., description="用户输入的验证码")


class UserInfo(BaseModel):
    """用户信息"""

    id: int
    username: str
    email: str
    full_name: str
    is_active: bool


class LoginResponse(BaseModel):
    """登录响应"""

    access_token: str
    token_type: str = "bearer"
    user_type: Literal["teacher", "student"]
    user: UserInfo


class TokenPayload(BaseModel):
    """Token 载荷"""

    sub: str  # 用户 ID
    type: str  # "teacher" or "student"
    exp: int  # 过期时间戳
