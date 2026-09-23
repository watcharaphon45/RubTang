-- CreateEnum
CREATE TYPE "LineReceiptStatus" AS ENUM ('SENT', 'FAILED', 'PENDING');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "lineUserId" TEXT,
ADD COLUMN "lineDisplayName" TEXT,
ADD COLUMN "linePictureUrl" TEXT,
ADD COLUMN "lineLinkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_lineUserId_key" ON "Customer"("tenantId", "lineUserId");

-- CreateTable
CREATE TABLE "LineOaSettings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "accountName" TEXT NOT NULL,
    "basicId" TEXT,
    "channelId" TEXT,
    "channelSecret" TEXT,
    "channelAccessToken" TEXT,
    "autoSendReceipt" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT,
    "qrCodeUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineOaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineOaSettings_tenantId_key" ON "LineOaSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "LineOaSettings" ADD CONSTRAINT "LineOaSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "LineReceiptLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "customerId" UUID,
    "lineUserId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "status" "LineReceiptStatus" NOT NULL DEFAULT 'SENT',
    "flexPayload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineReceiptLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineReceiptLog_tenantId_sentAt_idx" ON "LineReceiptLog"("tenantId", "sentAt");
CREATE INDEX "LineReceiptLog_tenantId_saleId_idx" ON "LineReceiptLog"("tenantId", "saleId");
CREATE INDEX "LineReceiptLog_tenantId_lineUserId_idx" ON "LineReceiptLog"("tenantId", "lineUserId");

-- AddForeignKey
ALTER TABLE "LineReceiptLog" ADD CONSTRAINT "LineReceiptLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineReceiptLog" ADD CONSTRAINT "LineReceiptLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineReceiptLog" ADD CONSTRAINT "LineReceiptLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
