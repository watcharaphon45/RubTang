-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'VOID_SALE';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "Sale" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "voidedById" UUID;
ALTER TABLE "Sale" ADD COLUMN "voidReason" TEXT;

-- CreateIndex
CREATE INDEX "Sale_tenantId_status_idx" ON "Sale"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_voidedById_fkey" FOREIGN KEY ("tenantId", "voidedById") REFERENCES "Membership"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
