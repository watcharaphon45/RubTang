-- CreateTable
CREATE TABLE "audit_action_definitions" (
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_action_definitions_pkey" PRIMARY KEY ("action")
);

-- Seed initial master action definitions
INSERT INTO "audit_action_definitions" ("action", "label", "category", "severity", "description", "isSystem", "createdAt", "updatedAt") VALUES
    ('TENANT_CREATED', 'สร้างร้านค้าใหม่', 'ADMIN', 'INFO', 'ลงทะเบียนเปิดร้านค้าใหม่ในระบบ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('BRANCH_CREATED', 'เพิ่มสาขาใหม่', 'ADMIN', 'INFO', 'เปิดสาขาใหม่ของร้านค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('STAFF_INVITED', 'เพิ่ม/เชิญพนักงาน', 'ADMIN', 'WARNING', 'เพิ่มผู้ใช้หรือมอบหมายสาขาให้พนักงาน', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LINE_SETTINGS_UPDATED', 'แก้ไขการตั้งค่า LINE OA', 'ADMIN', 'INFO', 'อัปเดตโทเคนและการเชื่อมต่อ LINE Official Account', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PRODUCT_CREATED', 'สร้างรายการสินค้า', 'CATALOG', 'INFO', 'เพิ่มสินค้าใหม่ลงในแค็ตตาล็อก', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PRODUCT_UPDATED', 'แก้ไขข้อมูลสินค้า/ราคา', 'CATALOG', 'INFO', 'แก้ไขชื่อ ราคา SKU หรือสถานะของสินค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('STOCK_MOVEMENT_CREATED', 'รับเข้า/ปรับยอดสต็อก', 'INVENTORY', 'WARNING', 'ทำรายการรับเข้าหรือปรับยอดสินค้าคงเหลือ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TRANSFER_INITIATED', 'เปิดใบโอนสินค้า', 'INVENTORY', 'INFO', 'สร้างคำขอโอนย้ายสินค้าระหว่างสาขา', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TRANSFER_COMPLETED', 'รับสินค้าโอนเข้าสาขา', 'INVENTORY', 'INFO', 'กดยืนยันรับสินค้าโอนย้ายเข้าสาขาปลายทาง', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('TRANSFER_CANCELLED', 'ยกเลิกใบโอนสินค้า', 'INVENTORY', 'WARNING', 'ยกเลิกคำขอโอนสินค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('STOCK_TAKE_STARTED', 'เปิดรอบตรวจนับสต็อก', 'INVENTORY', 'INFO', 'เริ่มต้นรอบตรวจนับสินค้าจริงในสาขา', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('STOCK_TAKE_APPROVED', 'อนุมัติกระทบยอดสต็อก', 'INVENTORY', 'WARNING', 'อนุมัติปรับยอดสต็อกตามผลการนับจริง', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('STOCK_TAKE_CANCELLED', 'ยกเลิกรอบตรวจนับสต็อก', 'INVENTORY', 'WARNING', 'ยกเลิกรอบตรวจนับสินค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SHIFT_OPENED', 'เปิดกะเงินสด', 'SHIFT', 'INFO', 'เปิดกะแคชเชียร์และบันทึกเงินทอนเริ่มต้น', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SHIFT_CLOSED', 'ปิดกะเงินสดและส่งยอด', 'SHIFT', 'INFO', 'ปิดกะแคชเชียร์ บันทึกยอดเงินสดและส่งยอด', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SALE_COMPLETED', 'บันทึกการขาย', 'SALES', 'INFO', 'ทำรายการชำระเงินและออกใบเสร็จสำเร็จ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SALE_VOIDED', 'ยกเลิกบิลขาย (Void)', 'SALES', 'CRITICAL', 'ยกเลิกบิลขาย คืนสต็อกและหักแต้มคืน', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SALE_RETURN_CREATED', 'คืนสินค้า/ออกใบลดหนี้', 'SALES', 'WARNING', 'ทำรายการรับคืนสินค้าบางส่วน/ทั้งหมด และออกใบลดหนี้ (CN)', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LINE_RECEIPT_SENT', 'ส่ง E-Receipt เข้า LINE', 'SALES', 'INFO', 'ส่งใบเสร็จอิเล็กทรอนิกส์ Flex Message เข้าบัญชี LINE ของลูกค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PROMOTION_CREATED', 'สร้างโปรโมชัน/คูปอง', 'MARKETING', 'INFO', 'สร้างแคมเปญส่วนลดหรือคูปองใหม่', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('COUPON_REDEEMED', 'ใช้คูปองส่วนลด', 'MARKETING', 'INFO', 'ลูกค้าใช้โค้ดคูปองส่วนลดในการชำระเงิน', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('POINTS_ADJUSTED', 'ปรับแต้มสะสมสมาชิก', 'MARKETING', 'WARNING', 'ปรับยอดแต้มสะสมของลูกค้าด้วยตนเอง', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LINE_CUSTOMER_LINKED', 'ผูกบัญชี LINE สมาชิก', 'MARKETING', 'INFO', 'เชื่อมต่อ LINE User ID กับข้อมูลลูกค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('LINE_CUSTOMER_UNLINKED', 'ยกเลิกผูกบัญชี LINE สมาชิก', 'MARKETING', 'INFO', 'ยกเลิกการเชื่อมต่อบัญชี LINE ของลูกค้า', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('SUPPLIER_CREATED', 'เพิ่มผู้จำหน่าย', 'PROCUREMENT', 'INFO', 'บันทึกข้อมูลซัพพลายเออร์ใหม่', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PURCHASE_ORDER_CREATED', 'สร้างใบสั่งซื้อ (PO)', 'PROCUREMENT', 'INFO', 'เปิดเอกสารใบสั่งซื้อสินค้าไปยังผู้จำหน่าย', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PURCHASE_ORDER_RECEIVED', 'รับสินค้าตามใบสั่งซื้อ', 'PROCUREMENT', 'INFO', 'ตรวจรับสินค้าเข้าสต็อกตามใบสั่งซื้อ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;
