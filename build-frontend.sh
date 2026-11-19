#!/usr/bin/env bash
# 一键构建前端产物（Web + 手机端 H5）
# 产物：apps/web/dist、apps/mobile/dist
# 用法：
#   ./build-frontend.sh
#   VITE_API_URL=https://erp.example.com/api ./build-frontend.sh
set -euo pipefail

cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || { echo "未找到 node，请先安装 Node 18+" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "未找到 npm，请先安装 Node 18+" >&2; exit 1; }

if [ ! -d node_modules ]; then
  echo "==> 未找到 node_modules，先安装依赖"
  npm ci
fi

echo "==> 构建 Web @rubber-erp/web"
npm run build --workspace=@rubber-erp/web

echo "==> 构建手机端 @rubber-erp/mobile"
npm run build --workspace=@rubber-erp/mobile

echo "==> 构建完成，产物目录：apps/web/dist、apps/mobile/dist"
