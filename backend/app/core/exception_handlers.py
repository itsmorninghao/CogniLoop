"""全局异常处理器"""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

import logging

logger = logging.getLogger(__name__)

# 字段名 → 中文
_FIELD_NAMES: dict[str, str] = {
    "username": "用户名",
    "email": "邮箱",
    "password": "密码",
    "full_name": "姓名",
    "captcha_id": "验证码 ID",
    "captcha_value": "验证码",
}

# 错误类型 → 中文模板（{field} 会被替换为字段中文名）
_ERROR_MESSAGES: dict[str, str] = {
    "missing": "请填写{field}",
    "string_too_short": "{field}长度不足，请检查填写内容",
    "string_too_long": "{field}超出最大长度，请检查填写内容",
    "value_error": "{field}格式不正确",
    "string_type": "{field}格式不正确",
}


def _friendly_validation_message(errors: list[dict]) -> str:
    """把 Pydantic validation errors 转成第一条中文友好提示"""
    for err in errors:
        loc = err.get("loc", [])
        field_key = loc[-1] if loc else ""
        field_name = _FIELD_NAMES.get(str(field_key), str(field_key))
        err_type = err.get("type", "")

        # 邮箱格式单独处理（type 为 value_error，msg 含 email）
        msg_raw = err.get("msg", "").lower()
        if "email" in msg_raw or "email" in err_type:
            return "请填写有效的邮箱地址"

        template = _ERROR_MESSAGES.get(err_type)
        if template:
            return template.format(field=field_name)

        # 兜底
        if field_name:
            return f"{field_name}填写有误，请检查"

    return "请求参数填写有误，请检查后重试"


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """处理 Pydantic 请求体校验错误，返回中文友好提示"""
    friendly = _friendly_validation_message(exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": friendly},
    )


async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """兜底异常处理，避免内部错误泄露"""
    logger.error("未处理的异常: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "服务器内部错误"},
    )
