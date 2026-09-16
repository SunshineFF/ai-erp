-- 物料分类仅保留在供应商档案（多选关联），客户档案不再使用
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_materialCategoryId_fkey";

DROP INDEX IF EXISTS "Customer_materialCategoryId_idx";

ALTER TABLE "Customer" DROP COLUMN IF EXISTS "materialCategoryId";
