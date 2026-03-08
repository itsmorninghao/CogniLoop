# 本地开发指南

## 后端

安装 uv (如果没有)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```bash
cd backend
```
安装依赖
```bash
uv sync
```
启动 PostgreSQL + Redis (可用 Docker)
```bash
docker compose up db redis -d
```
数据库迁移
```bash
uv run alembic upgrade head
```
启动后端
```bash
uv run uvicorn backend.app.main:app --reload --port 8000
```

## 前端

```bash
cd frontend
```
安装依赖
```bash
npm install
```
启动前端
```bash
npm run dev
```
