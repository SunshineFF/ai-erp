#!/usr/bin/env bash
# 一键构建脚本
# 默认构建前端（Web + 手机端 H5）；传入 backend 参数时额外构建后端 API
# 产物：apps/web/dist、apps/mobile/dist、apps/api/dist
# 用法：
#   ./build.sh                     # 前端（Web + 手机端）
#   ./build.sh backend             # 前端（Web + 手机端）+ 后端 API
#   VITE_API_URL=https://erp.example.com/api ./build.sh backend
set -euo pipefail

cd "$(dirname "$0")"

BUILD_BACKEND=false
for arg in "$@"; do
  case "$arg" in
    backend|--backend) BUILD_BACKEND=true ;;
    *) echo "未知参数：$arg（可用参数：backend）" >&2; exit 1 ;;
  esac
done

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

if [ "$BUILD_BACKEND" = true ]; then
  echo "==> 构建后端 @rubber-erp/api"
  npm run build --workspace=@rubber-erp/api
  echo "==> 构建完成，产物目录：apps/web/dist、apps/mobile/dist、apps/api/dist"
else
  echo "==> 构建完成，产物目录：apps/web/dist、apps/mobile/dist"
fi
