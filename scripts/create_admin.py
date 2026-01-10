#!/usr/bin/env python3
"""创建超级管理员账户脚本"""

import asyncio
import getpass
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.core.database import async_session_factory
from backend.app.services.admin_service import AdminService


async def create_super_admin(
    username: str = "admin",
    email: str = "admin@cogniloop.local",
    password: str = None,
    full_name: str = "系统管理员",
) -> None:
    """创建超级管理员"""
    if not password:
        raise ValueError("密码不能为空")

    async with async_session_factory() as session:
        admin_service = AdminService(session)
        try:
            admin = await admin_service.create_admin(
                username=username,
                email=email,
                password=password,
                full_name=full_name,
                is_super_admin=True,
            )
            await session.commit()
            print("✅ 超级管理员创建成功!")
            print(f"   用户名: {admin.username}")
            print(f"   邮箱: {admin.email}")
            print(f"   姓名: {admin.full_name}")
            print("\n请访问 /admin/login 登录管理后台")
        except ValueError as e:
            print(f"❌ 创建失败: {e}")
            # 如果用户名已存在，尝试获取信息
            if "用户名已存在" in str(e):
                print("   管理员已存在，无需重复创建")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="创建超级管理员账户")
    parser.add_argument("--username", default="admin", help="用户名")
    parser.add_argument("--email", default="admin@cogniloop.local", help="邮箱")
    parser.add_argument("--password", default=None, help="密码")
    parser.add_argument("--name", default="系统管理员", help="姓名")

    args = parser.parse_args()

    # 如果密码为空，通过交互式输入获取密码
    password = args.password
    if not password:
        password = getpass.getpass("请输入管理员密码: ")
        if not password:
            print("❌ 密码不能为空，操作已取消")
            sys.exit(1)
        # 确认密码
        password_confirm = getpass.getpass("请再次输入密码确认: ")
        if password != password_confirm:
            print("❌ 两次输入的密码不一致，操作已取消")
            sys.exit(1)

    asyncio.run(
        create_super_admin(
            username=args.username,
            email=args.email,
            password=password,
            full_name=args.name,
        )
    )
