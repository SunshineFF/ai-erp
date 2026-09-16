-- Remove legacy duplicate cash flows after preserving their complete snapshots.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "companyId", "occurredAt", "amount"
    ORDER BY "createdAt", "id"
  ) AS row_no
  FROM "CashFlow"
), duplicates AS (
  SELECT cash."id", cash."companyId", to_jsonb(cash) AS snapshot
  FROM "CashFlow" cash
  INNER JOIN ranked ON ranked."id" = cash."id"
  WHERE ranked.row_no > 1
)
INSERT INTO "AuditLog" ("id", "companyId", "action", "resourceType", "resourceId", "beforeData")
SELECT gen_random_uuid()::text, "companyId", 'cash_flow.duplicate_deleted', 'CashFlow', "id", snapshot
FROM duplicates;

DELETE FROM "CashFlow" cash
USING (
  SELECT "id"
  FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "companyId", "occurredAt", "amount"
      ORDER BY "createdAt", "id"
    ) AS row_no
    FROM "CashFlow"
  ) ranked
  WHERE ranked.row_no > 1
) duplicates
WHERE cash."id" = duplicates."id";

DROP INDEX "CashFlow_dedupeKey_key";
ALTER TABLE "CashFlow" DROP COLUMN "dedupeKey";
ALTER TABLE "CashFlow"
  ADD CONSTRAINT "CashFlow_companyId_occurredAt_amount_key"
  UNIQUE ("companyId", "occurredAt", "amount");
