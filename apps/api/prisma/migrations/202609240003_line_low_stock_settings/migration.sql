-- AlterTable
ALTER TABLE "Product" ADD COLUMN "reorderPoint" DECIMAL(14, 3);

-- AlterTable
ALTER TABLE "LineOaSettings" ADD COLUMN "lowStockAlertEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LineOaSettings" ADD COLUMN "lowStockThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "LineOaSettings" ADD COLUMN "lowStockTargetUserId" TEXT;
ALTER TABLE "LineOaSettings" ADD COLUMN "lowStockLastAlertAt" TIMESTAMP(3);
