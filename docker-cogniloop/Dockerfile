# 构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./

RUN npm ci --silent

COPY frontend/ ./

RUN npm run build

# 构建后端
FROM python:3.11-slim

LABEL maintainer="CogniLoop Team"
LABEL description="CogniLoop - 智能助教系统"
LABEL version="1.0.0"

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./

RUN uv pip install --system .

COPY backend/ /app/backend/
COPY scripts/ /app/scripts/

COPY --from=frontend-builder /frontend/dist /app/static

RUN mkdir -p /app/uploads /app/question_sets

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 迁移脚本
COPY docker-cogniloop/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

