# CogniLoop v2 — Multi-stage Dockerfile

# Stage 1: Frontend Build
FROM node:20-alpine AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install

COPY frontend/ ./
RUN npm run build


# Stage 2: Backend + Serve
FROM python:3.11-slim AS runtime

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies — install from pyproject.toml
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Pre-download Docling AI model weights (~500MB) for offline operation.
ENV DOCLING_MODELS_PATH=/app/docling_models
RUN uv run python -c "\
import os; os.makedirs('/app/docling_models', exist_ok=True); \
from docling.document_converter import DocumentConverter; \
DocumentConverter(); \
print('Docling models pre-downloaded.')"

# Copy backend source
COPY backend/ backend/
COPY alembic.ini ./

# Copy frontend build output
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Create directories
RUN mkdir -p uploads question_sets

# Entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
