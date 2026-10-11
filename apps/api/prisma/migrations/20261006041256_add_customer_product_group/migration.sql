-- CreateTable
CREATE TABLE "CustomerProductGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProductGroupLine" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "unitId" TEXT NOT NULL,
    "taxIncludedPrice" DECIMAL(18,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductGroupLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerProductGroup_customerId_idx" ON "CustomerProductGroup"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductGroup_companyId_customerId_code_key" ON "CustomerProductGroup"("companyId", "customerId", "code");

-- CreateIndex
CREATE INDEX "CustomerProductGroupLine_groupId_idx" ON "CustomerProductGroupLine"("groupId");

-- AddForeignKey
ALTER TABLE "CustomerProductGroup" ADD CONSTRAINT "CustomerProductGroup_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductGroupLine" ADD CONSTRAINT "CustomerProductGroupLine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerProductGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductGroupLine" ADD CONSTRAINT "CustomerProductGroupLine_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductGroupLine" ADD CONSTRAINT "CustomerProductGroupLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
