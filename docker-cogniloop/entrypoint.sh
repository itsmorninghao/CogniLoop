#!/bin/bash
set -e

echo "[entrypoint.sh-INFO] CogniLoop 启动脚本"

# 运行数据库迁移
echo "[entrypoint.sh-INFO] 运行数据库迁移..."
cd /app/backend
if alembic upgrade head; then
    echo "[entrypoint.sh-INFO] 数据库迁移成功"
else
    echo "[entrypoint.sh-ERROR] 数据库迁移失败"
    exit 1
fi

# 启动应用
echo "[entrypoint.sh-INFO] 启动 CogniLoop 服务..."
cd /app
exec "$@"
