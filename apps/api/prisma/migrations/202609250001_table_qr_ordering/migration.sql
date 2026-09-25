-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'BILLED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableOrderStatus" AS ENUM ('PENDING', 'COOKING', 'SERVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "zone" VARCHAR(50) NOT NULL DEFAULT 'General',
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "sessionToken" VARCHAR(64) NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "saleId" UUID,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableSessionId" UUID NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "status" "TableOrderStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tableOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_tenantId_branchId_number_key" ON "DiningTable"("tenantId", "branchId", "number");
CREATE INDEX "DiningTable_tenantId_branchId_active_idx" ON "DiningTable"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_sessionToken_key" ON "TableSession"("sessionToken");
CREATE INDEX "TableSession_tenantId_branchId_status_idx" ON "TableSession"("tenantId", "branchId", "status");
CREATE INDEX "TableSession_sessionToken_idx" ON "TableSession"("sessionToken");

-- CreateIndex
CREATE INDEX "TableOrder_tableSessionId_status_idx" ON "TableOrder"("tableSessionId", "status");

-- CreateIndex
CREATE INDEX "TableOrderItem_tableOrderId_idx" ON "TableOrderItem"("tableOrderId");
CREATE INDEX "TableOrderItem_productId_idx" ON "TableOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOrder" ADD CONSTRAINT "TableOrder_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableOrderItem" ADD CONSTRAINT "TableOrderItem_tableOrderId_fkey" FOREIGN KEY ("tableOrderId") REFERENCES "TableOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TableOrderItem" ADD CONSTRAINT "TableOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed navigation menu for Tables & QR Ordering
INSERT INTO "NavigationMenu" ("key", "section", "sectionLabel", "label", "icon", "sortOrder", "allowedRoles", "requiredFeature")
VALUES ('tables', 'SALES', 'ขายหน้าร้าน', 'โต๊ะ & สั่งอาหาร QR', 'QrCode', 25, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL)
ON CONFLICT ("key") DO NOTHING;

-- Grant permissions to default Positions
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, false
FROM "Position" p
JOIN "NavigationMenu" m ON m.key = 'tables'
WHERE p.code IN ('OWNER', 'MANAGER', 'HEAD_CASHIER')
ON CONFLICT ("positionId", "menuId") DO NOTHING;
