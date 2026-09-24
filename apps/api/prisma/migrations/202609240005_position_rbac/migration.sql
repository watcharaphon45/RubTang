-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionMenuPermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "positionId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionMenuPermission_pkey" PRIMARY KEY ("id")
);

-- Add ForeignKey and Columns to Membership
ALTER TABLE "Membership" ADD COLUMN "positionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Position_tenantId_code_key" ON "Position"("tenantId", "code");
CREATE INDEX "Position_tenantId_active_idx" ON "Position"("tenantId", "active");
CREATE UNIQUE INDEX "PositionMenuPermission_positionId_menuId_key" ON "PositionMenuPermission"("positionId", "menuId");
CREATE INDEX "PositionMenuPermission_positionId_idx" ON "PositionMenuPermission"("positionId");
CREATE INDEX "PositionMenuPermission_menuId_idx" ON "PositionMenuPermission"("menuId");
CREATE INDEX "Membership_positionId_idx" ON "Membership"("positionId");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionMenuPermission" ADD CONSTRAINT "PositionMenuPermission_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionMenuPermission" ADD CONSTRAINT "PositionMenuPermission_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "NavigationMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default positions for every existing Tenant
INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'OWNER', 'เจ้าของร้าน / ผู้บริหาร', 'มีสิทธิ์การเข้าถึงและการจัดการสูงสุดทุกเมนูของระบบ', true, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'MANAGER', 'ผู้จัดการร้าน / สาขา', 'ดูแลภาพรวมการขาย สต็อก พนักงาน และรายงานบริหาร', true, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'HEAD_CASHIER', 'หัวหน้าแคชเชียร์', 'ดูแลการขาย กะเงินสด ประวัติการขาย และรายงานสรุปหน้าเคาน์เตอร์', false, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'CASHIER', 'พนักงานแคชเชียร์', 'ทำรายการขายหน้าร้าน เปิด/ปิดกะเงินสด และสมัครสมาชิกลูกค้า', true, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'STOCK_CLERK', 'เจ้าหน้าที่คลังสินค้า', 'ตรวจนับสต็อก โอนย้ายสินค้า สั่งซื้อสินค้า และพิมพ์บาร์โค้ด', false, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Position" ("tenantId", "code", "name", "description", "isSystem", "active")
SELECT t.id, 'ACCOUNTANT', 'ฝ่ายการเงินและบัญชี', 'ตรวจสอบประวัติการขาย ใบกำกับภาษี สรุปกะ และรายงานทางการเงิน', false, true
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

-- Backfill existing memberships with their matching positionId based on role
UPDATE "Membership" m
SET "positionId" = p.id
FROM "Position" p
WHERE p."tenantId" = m."tenantId" AND p.code = m.role::text;

-- Seed PositionMenuPermission for OWNER (all menus, canView=true, canExport=true)
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, true
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'OWNER'
ON CONFLICT ("positionId", "menuId") DO NOTHING;

-- Seed PositionMenuPermission for MANAGER (all menus except branches_staff)
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, true
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'MANAGER' AND m.key NOT IN ('branches_staff')
ON CONFLICT ("positionId", "menuId") DO NOTHING;

-- Seed PositionMenuPermission for HEAD_CASHIER
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, true
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'HEAD_CASHIER' AND m.key IN ('dashboard', 'pos', 'shifts', 'sales_history', 'customers', 'promotions', 'products', 'reports')
ON CONFLICT ("positionId", "menuId") DO NOTHING;

-- Seed PositionMenuPermission for CASHIER
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, false
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'CASHIER' AND m.key IN ('pos', 'shifts', 'sales_history', 'customers', 'products')
ON CONFLICT ("positionId", "menuId") DO NOTHING;

-- Seed PositionMenuPermission for STOCK_CLERK
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, false
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'STOCK_CLERK' AND m.key IN ('dashboard', 'products', 'transfers', 'stock_take', 'barcode', 'suppliers', 'procurement')
ON CONFLICT ("positionId", "menuId") DO NOTHING;

-- Seed PositionMenuPermission for ACCOUNTANT
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, true
FROM "Position" p
CROSS JOIN "NavigationMenu" m
WHERE p.code = 'ACCOUNTANT' AND m.key IN ('dashboard', 'sales_history', 'shifts', 'reports', 'procurement')
ON CONFLICT ("positionId", "menuId") DO NOTHING;
