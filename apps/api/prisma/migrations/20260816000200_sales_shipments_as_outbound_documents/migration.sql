-- Upgrade sales shipments into complete outbound documents.
ALTER TABLE "SalesShipment"
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "shippedById" TEXT,
  ADD COLUMN "shippedByName" TEXT NOT NULL DEFAULT '系统',
  ADD COLUMN "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'CNY';

ALTER TABLE "SalesShipmentLine"
  ADD COLUMN "unitPrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "lineAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

UPDATE "SalesShipment" shipment
SET "customerId" = sales_order."customerId",
    "currencyCode" = sales_order."currencyCode"
FROM "SalesOrder" sales_order
WHERE sales_order."id" = shipment."salesOrderId";

UPDATE "SalesShipmentLine" shipment_line
SET "unitPrice" = order_line."unitPrice",
    "lineAmount" = ROUND((order_line."grossAmount" * shipment_line."quantity" / NULLIF(order_line."quantity", 0))::numeric, 2)
FROM "SalesOrderLine" order_line
WHERE order_line."id" = shipment_line."salesOrderLineId";

UPDATE "SalesShipment" shipment
SET "totalAmount" = totals.amount
FROM (
  SELECT "shipmentId", COALESCE(SUM("lineAmount"), 0) AS amount
  FROM "SalesShipmentLine"
  GROUP BY "shipmentId"
) totals
WHERE totals."shipmentId" = shipment."id";

ALTER TABLE "SalesShipment" ALTER COLUMN "customerId" SET NOT NULL;

CREATE INDEX "SalesShipment_companyId_shippedAt_idx" ON "SalesShipment"("companyId", "shippedAt");
CREATE INDEX "SalesShipment_salesOrderId_idx" ON "SalesShipment"("salesOrderId");
CREATE INDEX "SalesShipment_customerId_idx" ON "SalesShipment"("customerId");

ALTER TABLE "SalesShipment"
  ADD CONSTRAINT "SalesShipment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesShipment"
  ADD CONSTRAINT "SalesShipment_shippedById_fkey"
  FOREIGN KEY ("shippedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
