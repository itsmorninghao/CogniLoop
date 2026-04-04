FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json remotion.config.ts ./
COPY src/ src/
COPY public/ public/

# Bundle Remotion compositions + compile server
RUN npx remotion bundle src/index.tsx --out-dir bundle \
    && npx tsc -p tsconfig.server.json

# -------------------------------------------------------
FROM node:20-slim

# System deps for Chromium headless shell
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 \
    libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 \
    libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/bundle ./bundle
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Ensure Chrome headless shell is available
RUN npx remotion browser ensure

# Output directory for rendered videos
RUN mkdir -p /tmp/renderer_output

ENV PORT=3100
EXPOSE 3100

CMD ["node", "dist/server.js"]
