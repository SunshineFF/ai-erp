# 橡胶件制造 ERP MVP

当前项目已完成一期核心业务闭环，技术架构为 NestJS + Prisma + PostgreSQL，前端为 React + Vite + PWA。

## 已实现

- 用户登录与系统管理员初始化。
- 工作台指标和临期批次查询。
- 物料主数据查询与新增 API。
- 保密 BOM 查询与创建 API。
- 批次采购入库、库存余额和库存批次查询。
- 不拆生产工序的生产订单创建、BOM 理论用料展开和下达。
- 生产领料/退料、完工入库、销售批次发货/退货、调拨、盘点、调整、报废和冲销。
- 成品批次到原料批次的双向追溯、移动加权平均成本和库存金额。
- CNY/USD 汇率及订单金额/税额快照、XLSX 导入复核草稿和一期查询报表。
- 可配置动作权限、角色化菜单、关键操作审计和私有导入原件下载。
- CNY/USD、税率和冲销时限的数据库字段与种子配置。
- 响应式网页/手机端工作台和核心列表视图。

## 本地依赖

本机需要 Node 18+、Docker Desktop。项目使用可复用的 `local/erp-postgres-redis:16-7` 基础设施镜像，在一个容器内运行 PostgreSQL 16 和 Redis 7，并分别持久化到两个命名卷。当前版本已使用项目 Docker 数据库执行真实 API 与 XLSX 导入冒烟验证。

```powershell
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
```

首次使用或镜像变更时先构建：

```powershell
docker compose build erp-infra
docker compose up -d erp-infra
```

种子账号：`admin` / `Admin123!`。生产环境必须修改密码和 JWT 密钥。

## 启动开发服务

```powershell
npm run dev:api
npm run dev:web
```

- API：`http://localhost:3030/api`
- Web/PWA：`http://localhost:5173`

### 媒体存储

费用报销明细的支付凭证默认保存在 API 的 `storage/media` 目录，并通过 `/media/` 提供访问。生产环境可在 `apps/api/.env` 中设置 `MEDIA_STORAGE="aliyun-oss"`，并填写 `ALIYUN_OSS_REGION`、`ALIYUN_OSS_BUCKET`、`ALIYUN_OSS_ACCESS_KEY_ID`、`ALIYUN_OSS_ACCESS_KEY_SECRET`。如使用 CDN，设置 `ALIYUN_OSS_CDN_BASE_URL`，上传接口会返回 CDN 地址；AccessKey 只保存在后端环境变量，不会下发到前端。

## 验证

```powershell
npm test
npm run test:smoke
npm run build
```

`test:smoke` 需要先启动数据库容器，会在真实数据库上验证登录、权限、工作台、报表和样例 XLSX 解析，并自动清理测试导入任务。

## 目录

- `apps/api/prisma/schema.prisma`：一期 MVP Prisma 表结构。
- `apps/api/src/modules`：认证、工作台、物料、BOM、库存和生产 API。
- `apps/web/src`：React 工作台、列表视图和手机端响应式布局。
- Web 业务页面使用 BrowserRouter 独立路径；生产静态服务器必须把未知页面路径回退到 `index.html`（Nginx 使用 `try_files $uri $uri/ /index.html`）。
- `docs/04-一期数据库表设计.md`：逻辑表、字段、索引和约束设计。

## 上线前事项

1. 配置正式 `JWT_SECRET`、数据库口令和备份策略。
2. 接入选定的图片 OCR 服务；未配置时图片任务进入人工复核，不会自动过账。
3. 在隔离测试库执行完整采购到发货回归与备份恢复演练。
