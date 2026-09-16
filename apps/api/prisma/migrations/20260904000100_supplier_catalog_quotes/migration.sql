CREATE TYPE "PurchasePriceBasis" AS ENUM ('TAX_INCLUDED', 'CASH');

CREATE TABLE "SupplierMaterialCategory" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "SupplierMaterialCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierProduct" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierProductQuote" (
  "id" TEXT NOT NULL,
  "supplierProductId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
  "unitId" TEXT NOT NULL,
  "taxIncludedPrice" DECIMAL(18,6) NOT NULL,
  "cashPrice" DECIMAL(18,6),
  "supplierTaxRate" DECIMAL(5,4) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "transportMode" TEXT,
  "deliveryTerms" TEXT,
  "freightNote" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProductQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierContact" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT,
  "mobile" TEXT,
  "landline" TEXT,
  "email" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierAddress" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "province" TEXT,
  "city" TEXT,
  "district" TEXT,
  "detail" TEXT NOT NULL,
  "shippingPlace" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierAddress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PurchaseOrderLine"
  ADD COLUMN "supplierQuoteId" TEXT,
  ADD COLUMN "priceBasis" "PurchasePriceBasis" NOT NULL DEFAULT 'TAX_INCLUDED',
  ADD COLUMN "supplierTaxRateSnapshot" DECIMAL(5,4) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "SupplierMaterialCategory_supplierId_categoryId_key" ON "SupplierMaterialCategory"("supplierId", "categoryId");
CREATE INDEX "SupplierMaterialCategory_categoryId_idx" ON "SupplierMaterialCategory"("categoryId");
CREATE UNIQUE INDEX "SupplierProduct_supplierId_materialId_key" ON "SupplierProduct"("supplierId", "materialId");
CREATE INDEX "SupplierProduct_materialId_idx" ON "SupplierProduct"("materialId");
CREATE INDEX "SupplierProductQuote_supplierProductId_effectiveFrom_idx" ON "SupplierProductQuote"("supplierProductId", "effectiveFrom");
CREATE INDEX "SupplierContact_supplierId_isPrimary_idx" ON "SupplierContact"("supplierId", "isPrimary");
CREATE INDEX "SupplierAddress_supplierId_isDefault_idx" ON "SupplierAddress"("supplierId", "isDefault");

ALTER TABLE "SupplierMaterialCategory" ADD CONSTRAINT "SupplierMaterialCategory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierMaterialCategory" ADD CONSTRAINT "SupplierMaterialCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierProductQuote" ADD CONSTRAINT "SupplierProductQuote_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProductQuote" ADD CONSTRAINT "SupplierProductQuote_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_supplierQuoteId_fkey" FOREIGN KEY ("supplierQuoteId") REFERENCES "SupplierProductQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
