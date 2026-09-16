-- 生产订单支持关联多张销售订单：新增多对多关联表。
-- 业务规则：生产单创建时可多选销售单，合并后的销售明细作为生产明细初始值，可自由调整（不强绑定）；
-- 但关联了销售单时，每个产出物料的计划数量不得低于关联销售单明细的未完成数量（quantity - shippedQty）。
CREATE TABLE "ProductionOrderLink" (
  "id" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "salesOrderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionOrderLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionOrderLink_productionOrderId_salesOrderId_key" ON "ProductionOrderLink"("productionOrderId", "salesOrderId");

-- 外键：删除生产订单/销售订单时级联清理关联
ALTER TABLE "ProductionOrderLink" ADD CONSTRAINT "ProductionOrderLink_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrderLink" ADD CONSTRAINT "ProductionOrderLink_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
