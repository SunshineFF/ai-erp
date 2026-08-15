-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('RAW_MATERIAL', 'AUXILIARY', 'SEMI_FINISHED', 'FINISHED_GOOD', 'GOODS', 'SERVICE');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'PENDING_RELEASE', 'EFFECTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProductionType" AS ENUM ('MAKE_TO_ORDER', 'MAKE_TO_STOCK');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('AVAILABLE', 'LOCKED', 'FROZEN', 'QUARANTINE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'PRODUCTION_ISSUE', 'PRODUCTION_RETURN', 'PRODUCTION_RECEIPT', 'SALES_SHIPMENT', 'SALES_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_GAIN', 'ADJUSTMENT_LOSS', 'SCRAP', 'STOCKTAKE_GAIN', 'STOCKTAKE_LOSS', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InventoryDocumentType" AS ENUM ('TRANSFER', 'STOCKTAKE', 'ADJUSTMENT', 'SCRAP');

-- CreateEnum
CREATE TYPE "PostingStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportTaskStatus" AS ENUM ('PARSING', 'NEEDS_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'SETTLED', 'VOIDED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId","companyId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "settingValue" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rateDate" DATE NOT NULL,
    "rateToCny" DECIMAL(18,8) NOT NULL,
    "maintainedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConversion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT,
    "fromUnitId" TEXT NOT NULL,
    "toUnitId" TEXT NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "imageUrl" TEXT,
    "categoryId" TEXT NOT NULL,
    "materialType" "MaterialType" NOT NULL,
    "baseUnitId" TEXT NOT NULL,
    "batchRequired" BOOLEAN NOT NULL DEFAULT true,
    "expiryRule" TEXT NOT NULL DEFAULT 'SUPPLIER_LABEL_FIRST',
    "shelfLifeDays" INTEGER,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "defaultTaxRateId" TEXT,
    "defaultLocationId" TEXT,
    "minStockQty" DECIMAL(18,6),
    "purchasable" BOOLEAN NOT NULL DEFAULT false,
    "saleable" BOOLEAN NOT NULL DEFAULT false,
    "manufacturable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "exchangeRateDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxRateId" TEXT,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmountCny" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "receivedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "taxRateId" TEXT,
    "taxRateSnapshot" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossAmountCny" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "supplierBatchNo" TEXT,
    "batchNo" TEXT,
    "productionDate" DATE,
    "expiryDate" DATE,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedDate" DATE,
    "expectedShipmentAt" DATE,
    "actualShipmentAt" DATE,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "exchangeRateDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxRateId" TEXT,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmountCny" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "shippedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "taxRateId" TEXT,
    "taxRateSnapshot" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossAmountCny" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "outputMaterialId" TEXT NOT NULL,
    "versionNo" TEXT NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "standardOutputQty" DECIMAL(18,6) NOT NULL,
    "outputUnitId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "confidentialLevel" TEXT NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "inputMaterialId" TEXT NOT NULL,
    "requiredQty" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "lossRate" DECIMAL(5,4) NOT NULL DEFAULT 0,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productionType" "ProductionType" NOT NULL,
    "outputMaterialId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "bomVersionSnapshot" TEXT NOT NULL,
    "plannedQty" DECIMAL(18,6) NOT NULL,
    "completedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scrapQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "sourceSalesOrderId" TEXT,
    "sourceSalesOrderLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOutputLine" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "bomVersionSnapshot" TEXT NOT NULL,
    "plannedQty" DECIMAL(18,6) NOT NULL,
    "completedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scrapQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "sourceSalesOrderLineId" TEXT,

    CONSTRAINT "ProductionOutputLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMaterial" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "requiredQty" DECIMAL(18,6) NOT NULL,
    "issuedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "lossRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "productionOutputLineId" TEXT,

    CONSTRAINT "ProductionMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "supplierBatchNo" TEXT,
    "productionDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "batchStatus" "BatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "supplierName" TEXT,
    "unitCostCny" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "onHandQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "availableQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "transactionNo" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "companyId" TEXT NOT NULL,
    "transactionType" "InventoryTransactionType" NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantityDelta" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "unitCostCny" DECIMAL(18,6) NOT NULL,
    "amountDeltaCny" DECIMAL(18,6) NOT NULL,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "reversedTransactionId" TEXT,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonCode" TEXT,
    "remark" TEXT,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCost" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "onHandQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "inventoryValueCny" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "movingAverageCostCny" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "inventoryTransactionId" TEXT NOT NULL,
    "quantityDelta" DECIMAL(18,6) NOT NULL,
    "unitCostCny" DECIMAL(18,6) NOT NULL,
    "amountDeltaCny" DECIMAL(18,6) NOT NULL,
    "balanceQty" DECIMAL(18,6) NOT NULL,
    "balanceValueCny" DECIMAL(18,6) NOT NULL,
    "movingAverageCostCny" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchGenealogy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "outputBatchId" TEXT NOT NULL,
    "inputBatchId" TEXT NOT NULL,
    "inputMaterialId" TEXT NOT NULL,
    "consumedQty" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchGenealogy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesShipment" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "status" "PostingStatus" NOT NULL DEFAULT 'POSTED',
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "returnedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentType" "InventoryDocumentType" NOT NULL,
    "status" "PostingStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "reasonCode" TEXT,
    "remark" TEXT,
    "createdById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "countedQty" DECIMAL(18,6),
    "unitId" TEXT NOT NULL,

    CONSTRAINT "InventoryDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentFileId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "parseVersion" TEXT NOT NULL DEFAULT 'xlsx-v1',
    "status" "ImportTaskStatus" NOT NULL DEFAULT 'PARSING',
    "fieldMapping" JSONB,
    "draftDocumentNo" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTaskItem" (
    "id" TEXT NOT NULL,
    "importTaskId" TEXT NOT NULL,
    "sheetName" TEXT,
    "rowNo" INTEGER,
    "parsedData" JSONB NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "validationErrors" JSONB,

    CONSTRAINT "ImportTaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlow" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "flowType" "CashFlowType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurredAt" DATE NOT NULL,
    "expenseType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billType" "BillType" NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "supplierId" TEXT,
    "customerId" TEXT,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentNo" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "dueDate" DATE,
    "currencyCode" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_companyId_settingKey_key" ON "SystemSetting"("companyId", "settingKey");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_rateDate_idx" ON "ExchangeRate"("companyId", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_companyId_currencyCode_rateDate_key" ON "ExchangeRate"("companyId", "currencyCode", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_companyId_code_effectiveFrom_key" ON "TaxRate"("companyId", "code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_companyId_code_key" ON "Unit"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_companyId_materialId_fromUnitId_toUnitId_key" ON "UnitConversion"("companyId", "materialId", "fromUnitId", "toUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_companyId_code_key" ON "MaterialCategory"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_warehouseId_code_key" ON "Location"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_companyId_code_key" ON "Material"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_code_key" ON "Supplier"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_code_key" ON "Customer"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_documentNo_key" ON "PurchaseOrder"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_orderId_lineNo_key" ON "PurchaseOrderLine"("orderId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_documentNo_key" ON "SalesOrder"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_orderId_lineNo_key" ON "SalesOrderLine"("orderId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_companyId_outputMaterialId_versionNo_key" ON "Bom"("companyId", "outputMaterialId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_bomId_lineNo_key" ON "BomItem"("bomId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_documentNo_key" ON "ProductionOrder"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOutputLine_productionOrderId_lineNo_key" ON "ProductionOutputLine"("productionOrderId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionMaterial_productionOrderId_lineNo_key" ON "ProductionMaterial"("productionOrderId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_companyId_materialId_batchNo_key" ON "InventoryBatch"("companyId", "materialId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_companyId_warehouseId_locationId_materialI_key" ON "InventoryBalance"("companyId", "warehouseId", "locationId", "materialId", "batchId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_transactionNo_key" ON "InventoryTransaction"("transactionNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_reversedTransactionId_key" ON "InventoryTransaction"("reversedTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCost_companyId_materialId_key" ON "MaterialCost"("companyId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CostRecord_inventoryTransactionId_key" ON "CostRecord"("inventoryTransactionId");

-- CreateIndex
CREATE INDEX "CostRecord_companyId_materialId_createdAt_idx" ON "CostRecord"("companyId", "materialId", "createdAt");

-- CreateIndex
CREATE INDEX "BatchGenealogy_outputBatchId_idx" ON "BatchGenealogy"("outputBatchId");

-- CreateIndex
CREATE INDEX "BatchGenealogy_inputBatchId_idx" ON "BatchGenealogy"("inputBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchGenealogy_productionOrderId_outputBatchId_inputBatchId_key" ON "BatchGenealogy"("productionOrderId", "outputBatchId", "inputBatchId", "inputMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesShipment_documentNo_key" ON "SalesShipment"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesShipment_idempotencyKey_key" ON "SalesShipment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_documentNo_key" ON "InventoryDocument"("documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_idempotencyKey_key" ON "InventoryDocument"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocumentLine_documentId_lineNo_key" ON "InventoryDocumentLine"("documentId", "lineNo");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_createdAt_idx" ON "AuditLog"("resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlow_documentNo_key" ON "CashFlow"("documentNo");

-- CreateIndex
CREATE INDEX "CashFlow_companyId_occurredAt_idx" ON "CashFlow"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reimbursement_documentNo_key" ON "Reimbursement"("documentNo");

-- CreateIndex
CREATE INDEX "Reimbursement_companyId_occurredAt_idx" ON "Reimbursement"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_billNo_key" ON "Bill"("billNo");

-- CreateIndex
CREATE INDEX "Bill_companyId_billType_status_idx" ON "Bill"("companyId", "billType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_sourceDocumentType_sourceDocumentId_key" ON "Bill"("sourceDocumentType", "sourceDocumentId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutputLine" ADD CONSTRAINT "ProductionOutputLine_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterial" ADD CONSTRAINT "ProductionMaterial_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterial" ADD CONSTRAINT "ProductionMaterial_productionOutputLineId_fkey" FOREIGN KEY ("productionOutputLineId") REFERENCES "ProductionOutputLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipment" ADD CONSTRAINT "SalesShipment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipmentLine" ADD CONSTRAINT "SalesShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "SalesShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesShipmentLine" ADD CONSTRAINT "SalesShipmentLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTask" ADD CONSTRAINT "ImportTask_documentFileId_fkey" FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTaskItem" ADD CONSTRAINT "ImportTaskItem_importTaskId_fkey" FOREIGN KEY ("importTaskId") REFERENCES "ImportTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
