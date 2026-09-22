-- 一个账单对应多个销售/采购订单：Bill 拆分为头表 + BillLine 明细

-- CreateTable（先建子表，稍后回填数据）
CREATE TABLE "BillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id")
);

-- 回填：把既有单订单账单的来源单据转成明细行
INSERT INTO "BillLine" ("id", "billId", "orderId", "documentNo", "orderDate", "amount")
SELECT
    gen_random_uuid()::text,
    "b"."id",
    "b"."sourceDocumentId",
    "b"."sourceDocumentNo",
    "b"."billDate",
    "b"."amount"
FROM "Bill" "b";

-- 头表去掉来源单据字段
ALTER TABLE "Bill" DROP CONSTRAINT IF EXISTS "Bill_sourceDocumentType_sourceDocumentId_key";
ALTER TABLE "Bill" DROP COLUMN "sourceDocumentType";
ALTER TABLE "Bill" DROP COLUMN "sourceDocumentId";
ALTER TABLE "Bill" DROP COLUMN "sourceDocumentNo";

-- CreateIndex
CREATE UNIQUE INDEX "BillLine_billId_orderId_key" ON "BillLine"("billId", "orderId");
CREATE INDEX "BillLine_orderId_idx" ON "BillLine"("orderId");

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
