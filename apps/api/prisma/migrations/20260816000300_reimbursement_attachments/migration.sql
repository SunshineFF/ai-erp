-- Store payment vouchers for individual reimbursement items.
CREATE TABLE "ReimbursementAttachment" (
    "id" TEXT NOT NULL,
    "reimbursementItemId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReimbursementAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReimbursementAttachment_reimbursementItemId_idx" ON "ReimbursementAttachment"("reimbursementItemId");

ALTER TABLE "ReimbursementAttachment"
  ADD CONSTRAINT "ReimbursementAttachment_reimbursementItemId_fkey"
  FOREIGN KEY ("reimbursementItemId") REFERENCES "ReimbursementItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
