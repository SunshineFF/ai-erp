-- Prevent duplicate cash flows for the same company, date, and amount.
-- The nullable key keeps legacy duplicate rows intact while enforcing uniqueness
-- for all rows created after this migration.
ALTER TABLE "CashFlow" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "CashFlow_dedupeKey_key" ON "CashFlow"("dedupeKey");
