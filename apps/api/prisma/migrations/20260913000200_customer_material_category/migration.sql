-- 客户档案增加物料分类字段，用于客户编码自动生成
ALTER TABLE "Customer" ADD COLUMN "materialCategoryId" TEXT;

-- 外键：物料分类删除时置空
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_materialCategoryId_fkey"
  FOREIGN KEY ("materialCategoryId") REFERENCES "MaterialCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 按分类取号时加速查询
CREATE INDEX "Customer_materialCategoryId_idx" ON "Customer"("materialCategoryId");
