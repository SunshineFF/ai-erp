-- 供应商物料分类改为单选必填；供应商不再使用往来单位分类（PartnerCategory 仅保留客户类型）
-- 1) 为 Supplier 增加物料分类列（先可空，回填后再设为 NOT NULL）
ALTER TABLE "Supplier" ADD COLUMN "materialCategoryId" TEXT;

-- 2) 回填：优先取现有 SupplierMaterialCategory 中 isActive 的第一条（按分类编码排序），否则用默认分类
UPDATE "Supplier" s
SET "materialCategoryId" = linked."categoryId"
FROM (
  SELECT DISTINCT ON (smc."supplierId") smc."supplierId", smc."categoryId"
  FROM "SupplierMaterialCategory" smc
  JOIN "MaterialCategory" mc ON mc."id" = smc."categoryId"
  ORDER BY smc."supplierId", smc."isActive" DESC, mc."code" ASC
) linked
WHERE s."id" = linked."supplierId";

-- 无关联的供应商回填到编码最小的物料分类（保证 NOT NULL 约束可生效）
UPDATE "Supplier" s
SET "materialCategoryId" = mc."id"
FROM (SELECT "id" FROM "MaterialCategory" ORDER BY "code" ASC LIMIT 1) mc
WHERE s."materialCategoryId" IS NULL;

-- 3) 外键 + 索引 + 非空约束
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_materialCategoryId_fkey" FOREIGN KEY ("materialCategoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Supplier_materialCategoryId_idx" ON "Supplier"("materialCategoryId");
ALTER TABLE "Supplier" ALTER COLUMN "materialCategoryId" SET NOT NULL;

-- 4) 删除供应商的往来单位分类关联与多选关联表
ALTER TABLE "Supplier" DROP CONSTRAINT IF EXISTS "Supplier_partnerCategoryId_fkey";
DROP INDEX IF EXISTS "Supplier_partnerCategoryId_idx";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "partnerCategoryId";

DROP TABLE IF EXISTS "SupplierMaterialCategory";

-- 5) 删除供应商类型的往来单位分类数据（PartnerCategory 仅保留客户）
DELETE FROM "PartnerCategory" WHERE "partnerType" = 'supplier';
