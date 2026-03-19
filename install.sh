#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}  CogniLoop 一键安装脚本${NC}"
echo ""

if ! command -v docker &>/dev/null; then
  echo -e "${RED}错误:未检测到 Docker${NC}"
  echo "请先安装 Docker:https://docs.docker.com/get-started/get-docker/"
  exit 1
fi
echo -e "${GREEN}✓ $(docker --version)${NC}"

if ! docker compose version &>/dev/null; then
  echo -e "${RED}错误:未检测到 Docker Compose${NC}"
  echo "请先安装 Docker Compose:https://docs.docker.com/compose/install/"
  exit 1
fi
echo -e "${GREEN}✓ $(docker compose version)${NC}"

if ! docker info &>/dev/null; then
  echo -e "${RED}错误:Docker 守护进程未运行，请先启动 Docker${NC}"
  exit 1
fi

echo ""

INSTALL_DIR="cogniloop"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

REPO_RAW="https://raw.githubusercontent.com/itsmorninghao/CogniLoop/v2"
echo "正在下载配置文件..."
curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$REPO_RAW/.env.example" -o .env.example
cp .env.example .env
echo -e "${GREEN}✓ 配置文件下载完成${NC}"

echo ""

echo -e "${YELLOW}请设置数据库密码（推荐:直接回车将自动生成随机密码）:${NC}"
read -r -s DB_PASS </dev/tty
echo ""
if [ -z "$DB_PASS" ]; then
  DB_PASS=$(openssl rand -hex 16)
  echo -e "${GREEN}✓ 已自动生成随机密码${NC}"
fi

# 跨平台兼容 sed
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/DB_PASSWORD=CHANGE_ME/DB_PASSWORD=${DB_PASS}/" .env
else
  sed -i "s/DB_PASSWORD=CHANGE_ME/DB_PASSWORD=${DB_PASS}/" .env
fi

echo ""

echo "正在拉取镜像并启动服务，首次启动可能需要几分钟..."
echo ""
docker compose up -d

active_interface=$(ip route get 8.8.8.8 2>/dev/null | awk 'NR==1 {print $5}')
PUBLIC_IP=$(curl -s --max-time 5 https://api64.ipify.org 2>/dev/null)
if [[ -z "$active_interface" ]]; then
  LOCAL_IP="127.0.0.1"
else
  LOCAL_IP=$(ip -4 addr show dev "$active_interface" | grep -oE 'inet[[:space:]]+([0-9]{1,3}\.){3}[0-9]{1,3}' | awk '{print $2}')
fi
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="N/A"
fi
# IPv6 地址加方括号
if echo "$PUBLIC_IP" | grep -q ":"; then
  PUBLIC_IP="[${PUBLIC_IP}]"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  CogniLoop 已成功启动！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  内网访问:http://${LOCAL_IP}:8000"
echo "  公网访问:http://${PUBLIC_IP}:8000"
echo ""
echo "  接下来:"
echo "  1. 首次访问时创建管理员账号"
echo "  2. 进入 系统管理 → 系统设置，配置 LLM 和向量模型信息"
echo ""
