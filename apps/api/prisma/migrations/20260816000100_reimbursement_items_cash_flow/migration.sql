-- Add multi-line reimbursement details and link generated cash flows.
ALTER TABLE "CashFlow" ADD COLUMN "reimbursementId" TEXT;

CREATE TABLE "ReimbursementItem" (
    "id" TEXT NOT NULL,
    "reimbursementId" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReimbursementItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashFlow_reimbursementId_idx" ON "CashFlow"("reimbursementId");
CREATE INDEX "ReimbursementItem_reimbursementId_idx" ON "ReimbursementItem"("reimbursementId");

ALTER TABLE "CashFlow"
  ADD CONSTRAINT "CashFlow_reimbursementId_fkey"
  FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReimbursementItem"
  ADD CONSTRAINT "ReimbursementItem_reimbursementId_fkey"
  FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
