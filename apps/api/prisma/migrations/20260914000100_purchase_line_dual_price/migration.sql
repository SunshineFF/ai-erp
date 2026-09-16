-- 采购订单明细：单价拆分为含税价/不含税价两个字段，单独记录税点（默认 0），价格取用模式为含税或现金
-- 1) 新增不含税价与税点字段（先可空回填，再设默认值）
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "taxExcludedPrice" DECIMAL(18, 6);
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "taxRate" DECIMAL(5, 4);

-- 2) 回填：unitPrice 为取用价格（含税或现金），不含税价按税点折算；历史行 supplierTaxRateSnapshot 已有税点快照
UPDATE "PurchaseOrderLine" SET "taxRate" = COALESCE("supplierTaxRateSnapshot", 0);
UPDATE "PurchaseOrderLine" SET "taxExcludedPrice" = ROUND("unitPrice" / (1 + COALESCE("supplierTaxRateSnapshot", 0)), 6);

-- 3) 设默认值并置 NOT NULL（与 schema @default(0) 对齐）
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "taxExcludedPrice" SET DEFAULT 0;
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "taxRate" SET DEFAULT 0;
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "taxExcludedPrice" SET NOT NULL;
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "taxRate" SET NOT NULL;
