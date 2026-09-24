-- CreateTable
CREATE TABLE "system_status_definitions" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "bg_color" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_status_definitions_domain_code_key" ON "system_status_definitions"("domain", "code");
CREATE INDEX "system_status_definitions_domain_idx" ON "system_status_definitions"("domain");

-- Seed Initial System Status Definitions
INSERT INTO "system_status_definitions" ("id", "domain", "code", "label", "color", "bg_color", "icon", "sort_order", "is_terminal", "description")
VALUES
  -- TransferStatus
  (gen_random_uuid()::text, 'TRANSFER', 'IN_TRANSIT', 'กำลังขนส่ง', '#a36600', '#fff5df', 'Truck', 1, false, 'สินค้าอยู่ระหว่างการจัดส่งไปยังสาขาปลายทาง'),
  (gen_random_uuid()::text, 'TRANSFER', 'COMPLETED', 'รับสินค้าแล้ว', '#16825d', '#e8f5ed', 'CheckCircle2', 2, true, 'สาขาปลายทางกดยืนยันรับสินค้าเข้าคลังแล้ว'),
  (gen_random_uuid()::text, 'TRANSFER', 'CANCELLED', 'ยกเลิกแล้ว', '#c23f45', '#fff1f2', 'XCircle', 3, true, 'ยกเลิกใบโอนสินค้าระหว่างสาขา'),

  -- SaleStatus
  (gen_random_uuid()::text, 'SALE', 'COMPLETED', 'สำเร็จ', '#16825d', '#e8f5ed', 'CheckCircle2', 1, false, 'ชำระเงินและออกใบเสร็จรับเงินสำเร็จ'),
  (gen_random_uuid()::text, 'SALE', 'PARTIALLY_RETURNED', 'คืนสินค้าบางส่วน', '#a36600', '#fff5df', 'RotateCcw', 2, false, 'มีการรับคืนสินค้าบางรายการในบิล'),
  (gen_random_uuid()::text, 'SALE', 'VOIDED', 'ยกเลิกบิล (Void)', '#c23f45', '#fff1f2', 'Ban', 3, true, 'ยกเลิกรายการขายและคืนยอดเงินเต็มจำนวน'),

  -- ShiftStatus
  (gen_random_uuid()::text, 'SHIFT', 'OPEN', 'เปิดกะอยู่', '#16825d', '#e8f5ed', 'LockOpen', 1, false, 'กะเงินสดเปิดทำงานและบันทึกยอดขายอยู่'),
  (gen_random_uuid()::text, 'SHIFT', 'CLOSED', 'ปิดกะแล้ว', '#64748b', '#f1f5f9', 'Lock', 2, true, 'ปิดกะขายและส่งยอดเงินสดเรียบร้อยแล้ว'),

  -- PurchaseOrderStatus
  (gen_random_uuid()::text, 'PURCHASE_ORDER', 'DRAFT', 'แบบร่าง', '#64748b', '#f1f5f9', 'FileText', 1, false, 'ร่างเอกสารสั่งซื้อสินค้า ยังไม่ส่งให้คู่ค้า'),
  (gen_random_uuid()::text, 'PURCHASE_ORDER', 'ORDERED', 'สั่งซื้อแล้ว', '#0284c7', '#e0f2fe', 'Send', 2, false, 'ยืนยันใบสั่งซื้อและส่งให้ซัพพลายเออร์แล้ว'),
  (gen_random_uuid()::text, 'PURCHASE_ORDER', 'PARTIALLY_RECEIVED', 'รับสินค้าบางส่วน', '#a36600', '#fff5df', 'Clock', 3, false, 'สินค้าทยอยส่งมอบเข้าคลังบางรายการ'),
  (gen_random_uuid()::text, 'PURCHASE_ORDER', 'RECEIVED', 'รับสินค้าครบแล้ว', '#16825d', '#e8f5ed', 'CheckCircle2', 4, true, 'รับสินค้าเข้าคลังครบถ้วนตามใบสั่งซื้อ'),
  (gen_random_uuid()::text, 'PURCHASE_ORDER', 'CANCELLED', 'ยกเลิกแล้ว', '#c23f45', '#fff1f2', 'XCircle', 5, true, 'ยกเลิกใบสั่งซื้อสินค้า'),

  -- StockTakeStatus
  (gen_random_uuid()::text, 'STOCK_TAKE', 'IN_PROGRESS', 'กำลังตรวจนับ', '#a36600', '#fff5df', 'Clock', 1, false, 'อยู่ระหว่างการนับสินค้าและบันทึกยอดตรวจนับ'),
  (gen_random_uuid()::text, 'STOCK_TAKE', 'COMPLETED', 'ปรับยอดแล้ว', '#16825d', '#e8f5ed', 'CheckCircle2', 2, true, 'อนุมัติผลการตรวจนับและปรับปรุงยอดสต็อกแล้ว'),
  (gen_random_uuid()::text, 'STOCK_TAKE', 'CANCELLED', 'ยกเลิกแล้ว', '#c23f45', '#fff1f2', 'XCircle', 3, true, 'ยกเลิกรอบการตรวจนับสต็อกสินค้า'),

  -- TaxInvoiceStatus
  (gen_random_uuid()::text, 'TAX_INVOICE', 'ISSUED', 'ออกเอกสารแล้ว', '#16825d', '#e8f5ed', 'FileCheck', 1, false, 'ออกใบกำกับภาษีอย่างเต็มรูปสำเร็จ'),
  (gen_random_uuid()::text, 'TAX_INVOICE', 'CANCELLED', 'ยกเลิกแล้ว', '#c23f45', '#fff1f2', 'XCircle', 2, true, 'ยกเลิกใบกำกับภาษีเรียบร้อยแล้ว'),

  -- MovementType
  (gen_random_uuid()::text, 'MOVEMENT', 'RECEIVE', 'รับเข้า', '#16825d', '#e8f5ed', 'ArrowDownLeft', 1, false, 'รับสินค้าเข้าคลัง'),
  (gen_random_uuid()::text, 'MOVEMENT', 'ADJUSTMENT', 'ปรับยอดสต็อก', '#a36600', '#fff5df', 'Sliders', 2, false, 'ปรับเพิ่มหรือลดยอดสต็อกด้วยตนเอง'),
  (gen_random_uuid()::text, 'MOVEMENT', 'SALE', 'ขายหน้าร้าน', '#0284c7', '#e0f2fe', 'ShoppingBag', 3, false, 'ตัดสต็อกจากการขายหน้าร้าน POS'),
  (gen_random_uuid()::text, 'MOVEMENT', 'VOID_SALE', 'ยกเลิกการขาย', '#c23f45', '#fff1f2', 'Ban', 4, false, 'คืนยอดสต็อกจากการยกเลิกบิลขาย (Void)'),
  (gen_random_uuid()::text, 'MOVEMENT', 'TRANSFER_OUT', 'โอนสินค้าออก', '#d97706', '#fef3c7', 'ArrowUpRight', 5, false, 'ตัดสต็อกเพื่อโอนย้ายไปยังสาขาอื่น'),
  (gen_random_uuid()::text, 'MOVEMENT', 'TRANSFER_IN', 'โอนสินค้าเข้า', '#059669', '#d1fae5', 'ArrowDownLeft', 6, false, 'เพิ่มสต็อกจากการรับโอนสินค้าจากสาขาอื่น'),
  (gen_random_uuid()::text, 'MOVEMENT', 'RETURN', 'รับคืนสินค้า', '#7c3aed', '#ede9fe', 'RotateCcw', 7, false, 'เพิ่มสต็อกจากการรับคืนสินค้าจากลูกค้า')
ON CONFLICT ("domain", "code") DO NOTHING;
