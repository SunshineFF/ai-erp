ALTER TABLE "Material"
  ADD COLUMN "parentMaterialId" TEXT,
  ADD COLUMN "variantEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "imageStorageKey" TEXT,
  ADD COLUMN "imageStorageProvider" TEXT;

CREATE TABLE "ProductAttribute" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttributeValue" (
  "id" TEXT NOT NULL,
  "attributeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialAttribute" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "attributeId" TEXT NOT NULL,
  CONSTRAINT "MaterialAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialVariantValue" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "attributeValueId" TEXT NOT NULL,
  CONSTRAINT "MaterialVariantValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAttribute_companyId_code_key" ON "ProductAttribute"("companyId", "code");
CREATE INDEX "ProductAttribute_companyId_sortOrder_idx" ON "ProductAttribute"("companyId", "sortOrder");
CREATE UNIQUE INDEX "ProductAttributeValue_attributeId_code_key" ON "ProductAttributeValue"("attributeId", "code");
CREATE INDEX "ProductAttributeValue_attributeId_sortOrder_idx" ON "ProductAttributeValue"("attributeId", "sortOrder");
CREATE INDEX "Material_parentMaterialId_idx" ON "Material"("parentMaterialId");
CREATE UNIQUE INDEX "MaterialAttribute_materialId_attributeId_key" ON "MaterialAttribute"("materialId", "attributeId");
CREATE UNIQUE INDEX "MaterialVariantValue_materialId_attributeValueId_key" ON "MaterialVariantValue"("materialId", "attributeValueId");
CREATE INDEX "MaterialVariantValue_attributeValueId_idx" ON "MaterialVariantValue"("attributeValueId");

ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttribute" ADD CONSTRAINT "MaterialAttribute_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialAttribute" ADD CONSTRAINT "MaterialAttribute_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "ProductAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialVariantValue" ADD CONSTRAINT "MaterialVariantValue_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialVariantValue" ADD CONSTRAINT "MaterialVariantValue_attributeValueId_fkey"
  FOREIGN KEY ("attributeValueId") REFERENCES "ProductAttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_parentMaterialId_fkey"
  FOREIGN KEY ("parentMaterialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
