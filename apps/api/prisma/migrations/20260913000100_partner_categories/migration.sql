-- 供应商/客户分类：编码规则为 分类编码 + S/C + 5 位序号
CREATE TABLE "PartnerCategory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "partnerType" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerCategory_companyId_partnerType_code_key" ON "PartnerCategory"("companyId", "partnerType", "code");

ALTER TABLE "Supplier" ADD COLUMN "partnerCategoryId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "partnerCategoryId" TEXT;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_partnerCategoryId_fkey" FOREIGN KEY ("partnerCategoryId") REFERENCES "PartnerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_partnerCategoryId_fkey" FOREIGN KEY ("partnerCategoryId") REFERENCES "PartnerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
