#!/bin/bash
set -e

ENV_FILE="/app/.env"

# 自动生成缺失的高熵密钥，写回宿主机挂载的 .env 文件
needs_generation() {
  local val="$1"
  [[ -z "$val" ]]
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp
  tmp=$(mktemp)
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"
    echo "${key}=${value}" >> "$tmp"
  fi
  cp "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  export "${key}=${value}"
}

if [ -f "$ENV_FILE" ]; then
  if needs_generation "${JWT_SECRET_KEY:-}"; then
    echo "[setup] Generating JWT_SECRET_KEY..."
    JWT_KEY=$(openssl rand -base64 32)
    set_env_value "JWT_SECRET_KEY" "$JWT_KEY"
  fi

  if needs_generation "${ENCRYPTION_KEY:-}"; then
    echo "[setup] Generating ENCRYPTION_KEY..."
    ENC_KEY=$(uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    set_env_value "ENCRYPTION_KEY" "$ENC_KEY"
  fi
else
  echo "[setup] Warning: $ENV_FILE not found, skipping secret generation"
fi

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting CogniLoop v2..."
exec uv run uvicorn backend.app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers ${UVICORN_WORKERS:-4} \
    --log-level info
