export interface ActionMetadataItem {
  label: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description?: string | null;
}

export interface StatusDefinitionItem {
  domain: string;
  code: string;
  label: string;
  color: string | null;
  bgColor: string | null;
  icon: string | null;
  sortOrder: number;
  isTerminal: boolean;
  description: string | null;
}

// ─────────────────────────────────────────────────────────────
// Audit Action Definitions (Defaults & Fallbacks)
// ─────────────────────────────────────────────────────────────

export const ACTION_CATEGORIES: Record<string, string[]> = {
  SALES: ['SALE_COMPLETED', 'SALE_VOIDED', 'SALE_RETURN_CREATED', 'LINE_RECEIPT_SENT'],
  INVENTORY: [
    'STOCK_MOVEMENT_CREATED',
    'TRANSFER_INITIATED',
    'TRANSFER_COMPLETED',
    'TRANSFER_CANCELLED',
    'STOCK_TAKE_STARTED',
    'STOCK_TAKE_APPROVED',
    'STOCK_TAKE_CANCELLED',
    'LINE_LOW_STOCK_ALERT_SENT',
  ],
  CATALOG: ['PRODUCT_CREATED', 'PRODUCT_UPDATED'],
  SHIFT: ['SHIFT_OPENED', 'SHIFT_CLOSED'],
  MARKETING: [
    'PROMOTION_CREATED',
    'COUPON_REDEEMED',
    'POINTS_ADJUSTED',
    'LINE_CUSTOMER_LINKED',
    'LINE_CUSTOMER_UNLINKED',
  ],
  PROCUREMENT: [
    'SUPPLIER_CREATED',
    'PURCHASE_ORDER_CREATED',
    'PURCHASE_ORDER_RECEIVED',
  ],
  ADMIN: [
    'TENANT_CREATED',
    'BRANCH_CREATED',
    'STAFF_INVITED',
    'LINE_SETTINGS_UPDATED',
    'NAVIGATION_MENU_UPDATED',
    'POSITION_CREATED',
    'POSITION_UPDATED',
    'POSITION_PERMISSIONS_UPDATED',
  ],
};

export const ACTION_METADATA: Record<string, ActionMetadataItem> = {
  TENANT_CREATED: { label: 'สร้างร้านค้าใหม่', category: 'ADMIN', severity: 'INFO' },
  BRANCH_CREATED: { label: 'เพิ่มสาขาใหม่', category: 'ADMIN', severity: 'INFO' },
  STAFF_INVITED: { label: 'เพิ่ม/เชิญพนักงาน', category: 'ADMIN', severity: 'WARNING' },
  LINE_SETTINGS_UPDATED: { label: 'แก้ไขการตั้งค่า LINE OA', category: 'ADMIN', severity: 'INFO' },
  LINE_LOW_STOCK_ALERT_SENT: { label: 'แจ้งเตือนสินค้าใกล้หมดผ่าน LINE', category: 'INVENTORY', severity: 'WARNING' },
  NAVIGATION_MENU_UPDATED: { label: 'แก้ไขการตั้งค่าเมนูและสิทธิ์', category: 'ADMIN', severity: 'WARNING' },
  POSITION_CREATED: { label: 'สร้างตำแหน่งงานใหม่', category: 'ADMIN', severity: 'INFO' },
  POSITION_UPDATED: { label: 'แก้ไขข้อมูลตำแหน่งงาน', category: 'ADMIN', severity: 'INFO' },
  POSITION_PERMISSIONS_UPDATED: { label: 'แก้ไขสิทธิ์เมนูของตำแหน่งงาน', category: 'ADMIN', severity: 'WARNING' },
  PRODUCT_CREATED: { label: 'สร้างรายการสินค้า', category: 'CATALOG', severity: 'INFO' },
  PRODUCT_UPDATED: { label: 'แก้ไขข้อมูลสินค้า/ราคา', category: 'CATALOG', severity: 'INFO' },
  STOCK_MOVEMENT_CREATED: { label: 'รับเข้า/ปรับยอดสต็อก', category: 'INVENTORY', severity: 'WARNING' },
  TRANSFER_INITIATED: { label: 'เปิดใบโอนสินค้า', category: 'INVENTORY', severity: 'INFO' },
  TRANSFER_COMPLETED: { label: 'รับสินค้าโอนเข้าสาขา', category: 'INVENTORY', severity: 'INFO' },
  TRANSFER_CANCELLED: { label: 'ยกเลิกใบโอนสินค้า', category: 'INVENTORY', severity: 'WARNING' },
  STOCK_TAKE_STARTED: { label: 'เปิดรอบตรวจนับสต็อก', category: 'INVENTORY', severity: 'INFO' },
  STOCK_TAKE_APPROVED: { label: 'อนุมัติกระทบยอดสต็อก', category: 'INVENTORY', severity: 'WARNING' },
  STOCK_TAKE_CANCELLED: { label: 'ยกเลิกรอบตรวจนับสต็อก', category: 'INVENTORY', severity: 'WARNING' },
  SHIFT_OPENED: { label: 'เปิดกะเงินสด', category: 'SHIFT', severity: 'INFO' },
  SHIFT_CLOSED: { label: 'ปิดกะเงินสดและส่งยอด', category: 'SHIFT', severity: 'INFO' },
  SALE_COMPLETED: { label: 'บันทึกการขาย', category: 'SALES', severity: 'INFO' },
  SALE_VOIDED: { label: 'ยกเลิกบิลขาย (Void)', category: 'SALES', severity: 'CRITICAL' },
  SALE_RETURN_CREATED: { label: 'คืนสินค้า/ออกใบลดหนี้', category: 'SALES', severity: 'WARNING' },
  LINE_RECEIPT_SENT: { label: 'ส่ง E-Receipt เข้า LINE', category: 'SALES', severity: 'INFO' },
  PROMOTION_CREATED: { label: 'สร้างโปรโมชัน/คูปอง', category: 'MARKETING', severity: 'INFO' },
  COUPON_REDEEMED: { label: 'ใช้คูปองส่วนลด', category: 'MARKETING', severity: 'INFO' },
  POINTS_ADJUSTED: { label: 'ปรับแต้มสะสมสมาชิก', category: 'MARKETING', severity: 'WARNING' },
  LINE_CUSTOMER_LINKED: { label: 'ผูกบัญชี LINE สมาชิก', category: 'MARKETING', severity: 'INFO' },
  LINE_CUSTOMER_UNLINKED: { label: 'ยกเลิกผูกบัญชี LINE สมาชิก', category: 'MARKETING', severity: 'INFO' },
  SUPPLIER_CREATED: { label: 'เพิ่มผู้จำหน่าย', category: 'PROCUREMENT', severity: 'INFO' },
  PURCHASE_ORDER_CREATED: { label: 'สร้างใบสั่งซื้อ (PO)', category: 'PROCUREMENT', severity: 'INFO' },
  PURCHASE_ORDER_RECEIVED: { label: 'รับสินค้าตามใบสั่งซื้อ', category: 'PROCUREMENT', severity: 'INFO' },
};

// ─────────────────────────────────────────────────────────────
// System Status Definitions (Defaults & Fallbacks)
// ─────────────────────────────────────────────────────────────

export const DEFAULT_STATUS_DEFINITIONS: StatusDefinitionItem[] = [
  // TransferStatus
  { domain: 'TRANSFER', code: 'IN_TRANSIT', label: 'กำลังขนส่ง', color: '#a36600', bgColor: '#fff5df', icon: 'Truck', sortOrder: 1, isTerminal: false, description: 'สินค้าอยู่ระหว่างการจัดส่งไปยังสาขาปลายทาง' },
  { domain: 'TRANSFER', code: 'COMPLETED', label: 'รับสินค้าแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 2, isTerminal: true, description: 'สาขาปลายทางกดยืนยันรับสินค้าเข้าคลังแล้ว' },
  { domain: 'TRANSFER', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 3, isTerminal: true, description: 'ยกเลิกใบโอนสินค้าระหว่างสาขา' },

  // SaleStatus
  { domain: 'SALE', code: 'COMPLETED', label: 'สำเร็จ', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 1, isTerminal: false, description: 'ชำระเงินและออกใบเสร็จรับเงินสำเร็จ' },
  { domain: 'SALE', code: 'PARTIALLY_RETURNED', label: 'คืนสินค้าบางส่วน', color: '#a36600', bgColor: '#fff5df', icon: 'RotateCcw', sortOrder: 2, isTerminal: false, description: 'มีการรับคืนสินค้าบางรายการในบิล' },
  { domain: 'SALE', code: 'VOIDED', label: 'ยกเลิกบิล (Void)', color: '#c23f45', bgColor: '#fff1f2', icon: 'Ban', sortOrder: 3, isTerminal: true, description: 'ยกเลิกรายการขายและคืนยอดเงินเต็มจำนวน' },

  // ShiftStatus
  { domain: 'SHIFT', code: 'OPEN', label: 'เปิดกะอยู่', color: '#16825d', bgColor: '#e8f5ed', icon: 'LockOpen', sortOrder: 1, isTerminal: false, description: 'กะเงินสดเปิดทำงานและบันทึกยอดขายอยู่' },
  { domain: 'SHIFT', code: 'CLOSED', label: 'ปิดกะแล้ว', color: '#64748b', bgColor: '#f1f5f9', icon: 'Lock', sortOrder: 2, isTerminal: true, description: 'ปิดกะขายและส่งยอดเงินสดเรียบร้อยแล้ว' },

  // PurchaseOrderStatus
  { domain: 'PURCHASE_ORDER', code: 'DRAFT', label: 'แบบร่าง', color: '#64748b', bgColor: '#f1f5f9', icon: 'FileText', sortOrder: 1, isTerminal: false, description: 'ร่างเอกสารสั่งซื้อสินค้า ยังไม่ส่งให้คู่ค้า' },
  { domain: 'PURCHASE_ORDER', code: 'ORDERED', label: 'สั่งซื้อแล้ว', color: '#0284c7', bgColor: '#e0f2fe', icon: 'Send', sortOrder: 2, isTerminal: false, description: 'ยืนยันใบสั่งซื้อและส่งให้ซัพพลายเออร์แล้ว' },
  { domain: 'PURCHASE_ORDER', code: 'PARTIALLY_RECEIVED', label: 'รับสินค้าบางส่วน', color: '#a36600', bgColor: '#fff5df', icon: 'Clock', sortOrder: 3, isTerminal: false, description: 'สินค้าทยอยส่งมอบเข้าคลังบางรายการ' },
  { domain: 'PURCHASE_ORDER', code: 'RECEIVED', label: 'รับสินค้าครบแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 4, isTerminal: true, description: 'รับสินค้าเข้าคลังครบถ้วนตามใบสั่งซื้อ' },
  { domain: 'PURCHASE_ORDER', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 5, isTerminal: true, description: 'ยกเลิกใบสั่งซื้อสินค้า' },

  // StockTakeStatus
  { domain: 'STOCK_TAKE', code: 'IN_PROGRESS', label: 'กำลังตรวจนับ', color: '#a36600', bgColor: '#fff5df', icon: 'Clock', sortOrder: 1, isTerminal: false, description: 'อยู่ระหว่างการนับสินค้าและบันทึกยอดตรวจนับ' },
  { domain: 'STOCK_TAKE', code: 'COMPLETED', label: 'ปรับยอดแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 2, isTerminal: true, description: 'อนุมัติผลการตรวจนับและปรับปรุงยอดสต็อกแล้ว' },
  { domain: 'STOCK_TAKE', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 3, isTerminal: true, description: 'ยกเลิกรอบการตรวจนับสต็อกสินค้า' },

  // TaxInvoiceStatus
  { domain: 'TAX_INVOICE', code: 'ISSUED', label: 'ออกเอกสารแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'FileCheck', sortOrder: 1, isTerminal: false, description: 'ออกใบกำกับภาษีอย่างเต็มรูปสำเร็จ' },
  { domain: 'TAX_INVOICE', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 2, isTerminal: true, description: 'ยกเลิกใบกำกับภาษีเรียบร้อยแล้ว' },

  // MovementType
  { domain: 'MOVEMENT', code: 'RECEIVE', label: 'รับเข้า', color: '#16825d', bgColor: '#e8f5ed', icon: 'ArrowDownLeft', sortOrder: 1, isTerminal: false, description: 'รับสินค้าเข้าคลัง' },
  { domain: 'MOVEMENT', code: 'ADJUSTMENT', label: 'ปรับยอดสต็อก', color: '#a36600', bgColor: '#fff5df', icon: 'Sliders', sortOrder: 2, isTerminal: false, description: 'ปรับเพิ่มหรือลดยอดสต็อกด้วยตนเอง' },
  { domain: 'MOVEMENT', code: 'SALE', label: 'ขายหน้าร้าน', color: '#0284c7', bgColor: '#e0f2fe', icon: 'ShoppingBag', sortOrder: 3, isTerminal: false, description: 'ตัดสต็อกจากการขายหน้าร้าน POS' },
  { domain: 'MOVEMENT', code: 'VOID_SALE', label: 'ยกเลิกการขาย', color: '#c23f45', bgColor: '#fff1f2', icon: 'Ban', sortOrder: 4, isTerminal: false, description: 'คืนยอดสต็อกจากการยกเลิกบิลขาย (Void)' },
  { domain: 'MOVEMENT', code: 'TRANSFER_OUT', label: 'โอนสินค้าออก', color: '#d97706', bgColor: '#fef3c7', icon: 'ArrowUpRight', sortOrder: 5, isTerminal: false, description: 'ตัดสต็อกเพื่อโอนย้ายไปยังสาขาอื่น' },
  { domain: 'MOVEMENT', code: 'TRANSFER_IN', label: 'โอนสินค้าเข้า', color: '#059669', bgColor: '#d1fae5', icon: 'ArrowDownLeft', sortOrder: 6, isTerminal: false, description: 'เพิ่มสต็อกจากการรับโอนสินค้าจากสาขาอื่น' },
  { domain: 'MOVEMENT', code: 'RETURN', label: 'รับคืนสินค้า', color: '#7c3aed', bgColor: '#ede9fe', icon: 'RotateCcw', sortOrder: 7, isTerminal: false, description: 'เพิ่มสต็อกจากการรับคืนสินค้าจากลูกค้า' },
];
