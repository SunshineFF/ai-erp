-- ============================================================================
-- 项目：ai-erp
-- 用途：部署上线前，清空与真实业务相关的单据及流水数据
--       保留：基础档案（物料/供应商/客户/仓库/库位/单位/分类/BOM/用户/角色权限/汇率/税率等）
--       清空：库存、生产、销售（含出库/发货/退货）、采购（含收货）、财务凭证/应收应付/报销/现金流、审计日志
-- 执行方式（任选其一）：
--   1) psql "$DATABASE_URL" -f scripts/reset-business-data.sql
--   2) 打开 psql 控制台，执行 \i scripts/reset-business-data.sql
--   3) prisma db execute --file scripts/reset-business-data.sql
-- 注意：不可逆操作。执行前请确认已备份数据库（pg_dump）。
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 一、库存相关（先删子表，避免外键冲突）
-- ----------------------------------------------------------------------------

-- 成本流水（引用库存事务）
DELETE FROM "CostRecord";

-- 批次谱系（记录产出批次与投入批次的关系）
DELETE FROM "BatchGenealogy";

-- 库存单据行 -> 库存单据（调拨/盘点/调整/报废）
DELETE FROM "InventoryDocumentLine";
DELETE FROM "InventoryDocument";

-- 库存事务（采购入库/生产发料/销售出库/退货/盘盈盘亏等一切流水）
DELETE FROM "InventoryTransaction";

-- 库存余额（按 物料x库位x批次x单位）
DELETE FROM "InventoryBalance";

-- 库存批次
DELETE FROM "InventoryBatch";

-- 物料成本汇总（移动平均成本）
DELETE FROM "MaterialCost";

-- ----------------------------------------------------------------------------
-- 二、销售（含出库单/发货/退货）
-- ----------------------------------------------------------------------------

-- 出库单（发货单）行 -> 出库单
DELETE FROM "SalesShipmentLine";
DELETE FROM "SalesShipment";

-- 销售单行 -> 销售单
DELETE FROM "SalesOrderLine";
DELETE FROM "SalesOrder";

-- 客户产品组（销售单位配置）行 -> 组
DELETE FROM "CustomerProductGroupLine";
DELETE FROM "CustomerProductGroup";

-- ----------------------------------------------------------------------------
-- 三、生产
-- ----------------------------------------------------------------------------

-- 生产单关联销售单、生产领料、产出明细 -> 生产单
DELETE FROM "ProductionOrderLink";
DELETE FROM "ProductionMaterial";
DELETE FROM "ProductionOutputLine";
DELETE FROM "ProductionOrder";

-- ----------------------------------------------------------------------------
-- 四、采购（含收货/退货）
-- ----------------------------------------------------------------------------

-- 采购单行 -> 采购单
DELETE FROM "PurchaseOrderLine";
DELETE FROM "PurchaseOrder";

-- ----------------------------------------------------------------------------
-- 五、财务 / 资金
-- ----------------------------------------------------------------------------

-- 应付/应收 单据行 -> 单据
DELETE FROM "BillLine";
DELETE FROM "Bill";

-- 现金流（先删，其引用 Reimbursement 置空，但报销一并清空所以顺序随意）
DELETE FROM "CashFlow";

-- 报销附件 -> 报销明细 -> 报销单
DELETE FROM "ReimbursementAttachment";
DELETE FROM "ReimbursementItem";
DELETE FROM "Reimbursement";

-- ----------------------------------------------------------------------------
-- 六、导入任务（历史导入的临时/正式文件）
-- ----------------------------------------------------------------------------

DELETE FROM "ImportTaskItem";
DELETE FROM "ImportTask";
DELETE FROM "DocumentFile";

-- ----------------------------------------------------------------------------
-- 七、审计日志（业务操作异动/审计追溯记录，一并清空）
-- ----------------------------------------------------------------------------
DELETE FROM "AuditLog";

COMMIT;

-- 清理完成后，相关表已为空。业务单据号（documentNo/transactionNo 等）
-- 若为 UUID，删除后无需重置；若存在自增序列需重置，可对各表执行
-- SELECT setval(pg_get_serial_sequence('"TableName"','id'), 1, false);