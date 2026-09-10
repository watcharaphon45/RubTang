-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIVE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "oldValue" JSONB;

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceBefore" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_branchId_createdAt_id_idx" ON "StockMovement"("tenantId", "branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_branchId_productId_createdAt_idx" ON "StockMovement"("tenantId", "branchId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_requestId_key" ON "StockMovement"("tenantId", "requestId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_actorMembershipId_fkey" FOREIGN KEY ("tenantId", "actorMembershipId") REFERENCES "Membership"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial/stock invariants remain enforced even for non-API writes.
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_balanced" CHECK (
  "quantity" <> 0 AND "balanceBefore" >= 0 AND "balanceAfter" >= 0
  AND "balanceAfter" = "balanceBefore" + "quantity"
  AND ("type" <> 'RECEIVE' OR "quantity" > 0)
);
