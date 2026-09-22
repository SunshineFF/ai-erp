-- DropIndex
DROP INDEX "Supplier_materialCategoryId_idx";

-- AlterTable
ALTER TABLE "SalesShipment" ALTER COLUMN "shippedByName" DROP DEFAULT;
