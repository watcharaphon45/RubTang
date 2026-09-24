-- CreateTable
CREATE TABLE "NavigationMenu" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(64) NOT NULL,
    "section" VARCHAR(64) NOT NULL,
    "sectionLabel" VARCHAR(128) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "icon" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowedRoles" "Role"[] NOT NULL,
    "requiredFeature" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NavigationMenu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NavigationMenu_key_key" ON "NavigationMenu"("key");

-- CreateIndex
CREATE INDEX "NavigationMenu_section_sortOrder_idx" ON "NavigationMenu"("section", "sortOrder");

-- CreateIndex
CREATE INDEX "NavigationMenu_active_idx" ON "NavigationMenu"("active");

-- Seed standard system menus
INSERT INTO "NavigationMenu" ("key", "section", "sectionLabel", "label", "icon", "sortOrder", "allowedRoles", "requiredFeature") VALUES
('dashboard', 'MAIN', 'หน้าหลัก', 'ภาพรวม (Dashboard)', 'BarChart3', 10, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('pos', 'SALES', 'ขายหน้าร้าน', 'หน้าขาย (POS)', 'ShoppingCart', 20, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('shifts', 'SALES', 'ขายหน้าร้าน', 'กะเงินสด', 'CircleDollarSign', 30, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('sales_history', 'SALES', 'ขายหน้าร้าน', 'ประวัติการขาย', 'FileText', 40, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('customers', 'MARKETING', 'ลูกค้าและการตลาด', 'ลูกค้าและสมาชิก', 'UserRound', 50, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('promotions', 'MARKETING', 'ลูกค้าและการตลาด', 'โปรโมชันและคูปอง', 'BadgePercent', 60, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('line_oa', 'MARKETING', 'ลูกค้าและการตลาด', 'LINE OA & E-Receipt', 'MessageCircle', 70, ARRAY['OWNER'::"Role", 'MANAGER'::"Role"], 'FEATURE_LINE_OA'),
('products', 'INVENTORY', 'สินค้าและสต็อก', 'สินค้าของร้าน', 'Package', 80, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('transfers', 'INVENTORY', 'สินค้าและสต็อก', 'โอนย้ายสต็อก', 'ArrowLeftRight', 90, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('stock_take', 'INVENTORY', 'สินค้าและสต็อก', 'ตรวจนับสต็อก', 'ClipboardCheck', 100, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('barcode', 'INVENTORY', 'สินค้าและสต็อก', 'พิมพ์บาร์โค้ด / ป้ายราคา', 'Tag', 110, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('suppliers', 'INVENTORY', 'สินค้าและสต็อก', 'ผู้จำหน่าย', 'Building', 120, ARRAY['OWNER'::"Role", 'MANAGER'::"Role"], NULL),
('procurement', 'INVENTORY', 'สินค้าและสต็อก', 'สั่งซื้อและรับสินค้า (PO)', 'ClipboardList', 130, ARRAY['OWNER'::"Role", 'MANAGER'::"Role"], NULL),
('reports', 'MANAGEMENT', 'จัดการร้าน', 'รายงานยอดขาย', 'FileSpreadsheet', 140, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL),
('branches_staff', 'MANAGEMENT', 'จัดการร้าน', 'สาขาและพนักงาน', 'Building2', 150, ARRAY['OWNER'::"Role"], NULL),
('master_data', 'MANAGEMENT', 'จัดการร้าน', 'สถานะและ Master Data', 'SlidersHorizontal', 160, ARRAY['OWNER'::"Role", 'MANAGER'::"Role"], NULL),
('audit_log', 'MANAGEMENT', 'จัดการร้าน', 'ประวัติการตรวจสอบ (Audit)', 'History', 170, ARRAY['OWNER'::"Role", 'MANAGER'::"Role"], NULL);
