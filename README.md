# 橡胶件制造 ERP

面向橡胶件制造场景的一体化 ERP 系统（monorepo）。后端 NestJS + Prisma + PostgreSQL + Redis，前端 React + Vite（Web/移动端双端），覆盖采购、销售、生产、库存、财务、报销的全流程业务闭环。

---

## 一、技术架构

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 后端 API | NestJS 10 | `apps/api`，默认端口 `3030`，路由前缀 `/api` |
| ORM | Prisma 5 | `apps/api/prisma/schema.prisma` |
| 数据库 | PostgreSQL 16 | 容器 `erp-shared-infra` 提供 |
| 缓存/队列 | Redis 7 | 同上容器提供 |
| Web 前端 | React 18 + Vite + PWA | `apps/web`，默认端口 `5173` |
| 移动端 | React Native Web + antd | `apps/mobile`，默认端口 `5177` |
| 语言 | TypeScript | 全栈 |

核心能力：批次化库存、移动加权平均成本、批次双向追溯、保密 BOM、销售出库/退货（按批次自动扣减）、采购收货/退货、生产领料/退料/完工入库、调拨/盘点/调整/报废/冲销、应收应付、费用报销、XLSX 导入复核、动作级权限、操作审计、企业微信登录、阿里云 OSS 媒体存储。

---

## 二、本地开发环境

要求：Node 18+、Docker Desktop、npm。

### 1. 启动基础设施（PostgreSQL + Redis）

```powershell
# 首次或镜像变更时构建
docker compose build erp-infra
docker compose up -d erp-infra
```

`docker-compose.yml` 中可覆盖的环境变量：`POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_PORT` / `REDIS_PASSWORD` / `REDIS_PORT`（均有默认值，见文件）。

健康检查就绪后（`docker compose ps` 显示 healthy），初始化数据库：

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

> `db:seed` 使用 Prisma `upsert` 幂等写入基础档案（公司、币种、权限、管理员账号、单位、物料分类、汇率、税率等），**可重复执行**。默认种子账号：`admin` / `Admin123!`。**生产环境必须修改密码与 JWT 密钥。**

### 2. 配置后端环境变量

```powershell
cd apps/api
Copy-Item .env.example .env
```

默认 `.env` 即可连本地容器。后续自行修改 `DATABASE_URL`、`JWT_SECRET`、`PORT` 等（完整清单见下文第五节）。

### 3. 配置前端后端地址

前端通过 `VITE_API_URL` 指向 API。不配置时默认使用 `http://<当前hostname>:3030/api`。

- Web：`apps/web/.env`（可选，默认已能用）
- 移动端：`apps/mobile/.env`，内容示例见 `apps/mobile/.env.example`：

```
VITE_API_URL="http://127.0.0.1:3030/api"
```

### 4. 启动服务

```powershell
npm run dev:api   # API   -> http://localhost:3030/api
npm run dev:web   # Web   -> http://localhost:5173
npm run dev:mobile# 移动端 -> http://localhost:5177
```

### 5. 验证

```powershell
npm test           # API 单元/集成测试
npm run test:smoke # 冒烟测试（依赖数据库容器，自动清理测试任务）
npm run build      # 全仓类型检查 + 构建
```

---

## 三、生产部署

线上方式：**只部署各端构建产物，后端不依赖 docker 环境**。数据库（PostgreSQL）与 Redis 由生产环境外部提供（云 RDS / 自建实例），API、Web、移动端均直接运行编译后的静态/Node 产物。

### 部署形态

| 组件 | 部署方式 | 说明 |
| --- | --- | --- |
| PostgreSQL | 外部提供（云 RDS/自建） | 通过 `DATABASE_URL` 连接，无需 docker |
| Redis | 外部提供（云/自建） | 通过 `REDIS_URL` 连接，无需 docker |
| API | Node 运行构建产物 `dist` | 用 systemd/PM2 托管，端口 3030 |
| Web / 移动端 | 构建静态产物 | Nginx 伺服，端口 443/80 |
| Nginx | 服务器本机安装 | 伺服静态资源 + 反向代理 `/api` |

### 第一步：在具备 Node 18+ 的构建机/部署机执行

```powershell
npm ci
npm run db:generate
npm run db:migrate   # 指向生产 DATABASE_URL 建表/迁移
npm run db:seed      # 写入基础档案与管理员（幂等）
```

> 迁移与种子可在构建机执行，也可直接在应用首次启动前于生产执行；需暂以生产 `DATABASE_URL` 运行。生产环境**不要**使用 docker 提供的本地 PostgreSQL/Redis。

### 第二步：构建并部署后端

```powershell
npm run build --workspace=@rubber-erp/api
# 产物：apps/api/dist
# 启动：node apps/api/dist/src/main.js
```

建议用进程守护（systemd/PM2）托管，并写入生产级环境变量（见第五节），如：

```
DATABASE_URL=postgresql://erp:<强口令>@<db-host>:5432/rubber_erp?schema=public
JWT_SECRET=<64位以上随机串>
PORT=3030
WEB_ORIGIN=https://erp.example.com
MOBILE_ORIGIN=https://m.erp.example.com
```

### 第三步：构建前端并配置 Nginx

```powershell
npm run build --workspace=@rubber-erp/web     # 产物 apps/web/dist
npm run build --workspace=@rubber-erp/mobile  # 产物 apps/mobile/dist
```

**关键**：前端使用 BrowserRouter，Nginx 必须把未知路径回退到 `index.html`，否则刷新会 404：

```nginx
server {
    listen 80;
    server_name erp.example.com;

    root /srv/erp/web-dist;
    index index.html;

    # SPA 路由回退（必须）
    location / { try_files $uri $uri/ /index.html; }

    # 反向代理 API（前端默认请求同源 :3030，此处统一到 /api）
    location /api/ {
        proxy_pass http://127.0.0.1:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 媒体文件（本地存储模式）
    location /media/ {
        proxy_pass http://127.0.0.1:3030;
    }
    location /uploads/materials/ {
        proxy_pass http://127.0.0.1:3030;
    }
}
```

也可把原生 3030 端口关闭、仅经 Nginx 暴露。此时前端两种接入方式：

1. **推荐（同源）**：前端代码里 `VITE_API_URL="/api"` 指向相对路径，由 Nginx 把 `/api` 反代到后端，规避跨域。
2. **跨源**：前端 `VITE_API_URL="https://api.erp.example.com/api"`，此时需在 API 的 `WEB_ORIGIN`/`MOBILE_ORIGIN` 配置对应前端域名（CORS 白名单）。

### 第四步：上线前数据清理（如需）

若开发期在正式库写入过测试业务数据，可在部署前执行清理脚本（仅清除业务单据，保留基础档案）：

```powershell
psql "$DATABASE_URL" -f scripts/reset-business-data.sql
```

> 不可逆操作，执行前务必 `pg_dump` 备份。脚本覆盖：库存、销售（含出库/退货）、生产、采购、财务/报销、导入任务；保留物料/供应商/客户/仓库/BOM/用户/角色权限等基础档案。

---

## 四、媒体存储

报销凭证与物料图片默认保存在 API 本地，通过 `/media/`、`/uploads/materials/` 访问。

### 本地模式（默认）

- 目录由 `MEDIA_LOCAL_DIR` 指定，默认 `storage/media`
- 公网访问前缀 `MEDIA_PUBLIC_BASE_URL`（生产填 `https://erp.example.com`）

### 阿里云 OSS 模式

在 `apps/api/.env` 设置：

```
MEDIA_STORAGE="aliyun-oss"
ALIYUN_OSS_REGION="oss-cn-hangzhou"
ALIYUN_OSS_BUCKET="<bucket>"
ALIYUN_OSS_ACCESS_KEY_ID="<AK>"
ALIYUN_OSS_ACCESS_KEY_SECRET="<SK>"
ALIYUN_OSS_ENDPOINT=""            # 可留空，由 region 推断
ALIYUN_OSS_PUBLIC_BASE_URL="https://<bucket>.oss-<region>.aliyuncs.com"
# 若使用 CDN：
ALIYUN_OSS_CDN_BASE_URL="https://cdn.example.com"
```

> AccessKey 仅存在后端环境变量，不会下发到前端。

---

## 五、环境变量清单（API）

见 `apps/api/.env.example`，生产必改项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 本地容器 | PostgreSQL 连接串。**生产必改** |
| `JWT_SECRET` | `local-development-only` | 签名密钥。**生产必改**，建议 ≥64 位随机 |
| `PORT` | `3030` | API 端口 |
| `WEB_ORIGIN` | `http://localhost:5173` | Web CORS 白名单 |
| `MOBILE_ORIGIN` | `http://localhost:5177` | 移动端 CORS 白名单 |
| `REDIS_URL` | 本地容器 | Redis 连接串 |
| `WECOM_CORP_ID` / `AGENT_ID` / `SECRET` / `REDIRECT_URI` / `SCOPE` | 空 | 企业微信扫码登录（可选，留空则走账密登录） |
| `MEDIA_STORAGE` | `local` | 媒体存储：`local` 或 `aliyun-oss` |
| `MEDIA_PUBLIC_BASE_URL` | `http://localhost:3030` | 本地媒体公网前缀 |
| `MEDIA_LOCAL_DIR` | `storage/media` | 本地媒体目录 |

---

## 六、上线前核对清单

1. `JWT_SECRET`、数据库口令改为强随机值（生产数据库/Redis 应为外部实例，不使用本地容器的默认口令）。
2. 修改种子管理员 `admin` 密码，或禁用默认账号；清理无用的 Role/User。
3. 配置好外部服务：企业微信登录、阿里云 OSS / 图片 OCR（若启用）；未配置 OCR 时图片任务进入人工复核。
4. 开启数据库定时备份（`pg_dump` + 异地存储）并演练恢复。
5. 在隔离测试库执行「采购 → 生产 → 出库 → 退货」全链路回归与备份恢复演练。
6. 配置 HTTPS 证书（Nginx/网关终止 TLS），前端强制跳转 443。
7. 验证 Nginx SPA 路由 `try_files` 回退配置，确保刷新不 404。

---

## 七、目录结构

```
apps/
  api/          # NestJS 后端
    prisma/     # schema 与 seed
    src/modules # 认证/物料/BOM/库存/采购/销售/生产/财务/报表等
    src/        # main.ts、app.module.ts、过滤/守卫
  web/          # React Web 前端（BrowserRouter SPA + PWA）
  mobile/       # React Native Web 移动端
docker/
  shared-infra/ # 一体化 PostgreSQL+Redis 镜像（local/erp-postgres-redis:16-7）
docs/           # 文档（如 04-一期数据库表设计.md）
scripts/
  reset-business-data.sql  # 上线前清空业务单据数据脚本
```

---

## 八、关键实现说明

- **库存核算**：批次可按效期自动扣减；销售出库自动按批次多批次分配；出库/退货均回写原批次与销售单 `shippedQty`/`returnedQty`。
- **成本**：移动加权平均成本，库存余额 + 物料成本汇总，逐事务写入 `CostRecord`。
- **追溯**：`BatchGenealogy` 维持产出批次 → 投入批次的谱系，支持双向追溯。
- **权限**：动作级权限 + 角色化菜单；关键操作写 `AuditLog`。
- **幂等**：库存事务/出库单均带 idempotency key，防止重复提交。
- **SPA**：前端 BrowserRouter 独立路径，生产静态服务器必须回退到 `index.html`。