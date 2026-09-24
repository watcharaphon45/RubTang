import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => i.message).join(', '));
  return result.data;
}

const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(12, 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร').max(128);
export const registerSchema = z.object({
  email, password,
  displayName: z.string().trim().min(1).max(100),
  shopName: z.string().trim().min(1).max(120),
  branchName: z.string().trim().min(1).max(120),
}).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(80).optional(),
  price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'ราคาต้องเป็นเลขบวกหรือศูนย์ และมีทศนิยมไม่เกิน 2 ตำแหน่ง'),
}).strict();

export const productUpdateSchema = productSchema.extend({ active: z.boolean() }).strict();

export const movementSchema = z.object({
  requestId: z.uuid(),
  branchId: z.uuid(),
  productId: z.uuid(),
  type: z.enum(['RECEIVE', 'ADJUSTMENT']),
  quantity: z.string().regex(/^-?\d{1,11}(\.\d{1,3})?$/, 'จำนวนต้องเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง'),
  note: z.string().trim().min(1, 'กรุณาระบุเหตุผลหรือเอกสารอ้างอิง').max(500),
}).strict().superRefine((value, context) => {
  if (Number(value.quantity) === 0 || (value.type === 'RECEIVE' && Number(value.quantity) <= 0)) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: value.type === 'RECEIVE' ? 'จำนวนรับเข้าต้องมากกว่า 0' : 'จำนวนปรับต้องไม่เท่ากับ 0' });
  }
});
export const branchCreateSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อสาขา').max(120),
}).strict();

export const staffCreateSchema = z.object({
  displayName: z.string().trim().min(1, 'กรุณาระบุชื่อพนักงาน').max(100),
  email,
  password,
  role: z.enum(['MANAGER', 'CASHIER']),
  branchIds: z.array(z.string().uuid()).min(1, 'กรุณาเลือกอย่างน้อยหนึ่งสาขา'),
}).strict();

export const checkoutSchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง'),
  customerId: z.string().uuid('รหัสลูกค้าไม่ถูกต้อง').optional(),
  items: z.array(z.object({
    productId: z.string().uuid('รหัสสินค้าไม่ถูกต้อง'),
    quantity: z.number().positive('จำนวนสินค้าต้องมากกว่า 0'),
  })).min(1, 'ต้องมีสินค้าอย่างน้อย 1 รายการในตะกร้า'),
  discount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'ส่วนลดต้องเป็นตัวเลขบวกหรือ 0').default('0'),
  redeemPoints: z.number().int().min(0, 'จำนวนแต้มต้องเป็นเลขบวกหรือ 0').default(0).optional(),
  paymentMethod: z.enum(['CASH', 'TRANSFER']),
  receivedAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional(),
  transferRef: z.string().trim().max(100).optional(),
}).strict();

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อลูกค้า').max(120),
  phone: z.string().trim().min(8, 'เบอร์โทรต้องมีอย่างน้อย 8 หลัก').max(25),
  note: z.string().trim().max(500).optional(),
}).strict();

export const voidSaleSchema = z.object({
  reason: z.string().trim().min(3, 'กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร').max(255, 'เหตุผลยาวเกินกำหนด'),
}).strict();

export const openShiftSchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง'),
  startingCash: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'จำนวนเงินทอนต้องเป็นตัวเลขบวกหรือ 0'),
  note: z.string().trim().max(255).optional(),
}).strict();

export const closeShiftSchema = z.object({
  actualCash: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'จำนวนเงินที่นับได้ต้องเป็นตัวเลขบวกหรือ 0'),
  note: z.string().trim().max(255).optional(),
}).strict();

export const createTransferSchema = z.object({
  originBranchId: z.string().uuid('รหัสสาขาต้นทางไม่ถูกต้อง'),
  destinationBranchId: z.string().uuid('รหัสสาขาปลายทางไม่ถูกต้อง'),
  items: z.array(z.object({
    productId: z.string().uuid('รหัสสินค้าไม่ถูกต้อง'),
    quantity: z.number().positive('จำนวนสินค้าต้องมากกว่า 0'),
  })).min(1, 'ต้องมีสินค้าอย่างน้อย 1 รายการเพื่อโอนย้าย'),
  note: z.string().trim().max(255).optional(),
}).strict().refine(data => data.originBranchId !== data.destinationBranchId, {
  message: 'สาขาต้นทางและปลายทางต้องไม่เป็นสาขาเดียวกัน',
  path: ['destinationBranchId'],
});

export const createPromotionSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อโปรโมชัน').max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'รหัสคูปองต้องเป็นตัวอักษรภาษาอังกฤษหรือตัวเลข 3-30 ตัว').optional().nullable(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'มูลค่าส่วนลดต้องเป็นตัวเลขบวก'),
  minSpend: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'ยอดซื้อขั้นต่ำต้องเป็นตัวเลขบวกหรือ 0').default('0'),
  maxDiscount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional().nullable(),
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง').optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
}).strict();

export const updatePromotionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/).optional().nullable(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional(),
  minSpend: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional(),
  maxDiscount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
}).strict();

export const validatePromotionSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, 'กรุณาระบุรหัสคูปอง').optional(),
  promotionId: z.string().uuid().optional(),
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง'),
  subtotal: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'ยอดรวมต้องเป็นตัวเลขบวก'),
}).strict().refine(data => Boolean(data.code || data.promotionId), {
  message: 'ต้องระบุ code หรือ promotionId อย่างน้อยหนึ่งอย่าง',
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'ต้องระบุชื่อผู้จำหน่าย').max(150, 'ชื่อผู้จำหน่ายต้องไม่เกิน 150 ตัวอักษร'),
  contactName: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  creditDays: z.number().int().min(0, 'เครดิตเทอมต้องไม่ติดลบ').max(365, 'เครดิตเทอมสูงสุดไม่เกิน 365 วัน').default(0),
}).strict();

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(1, 'ต้องระบุชื่อผู้จำหน่าย').max(150).optional(),
  contactName: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  creditDays: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
}).strict();

export const createPurchaseOrderItemSchema = z.object({
  productId: z.string().uuid('รหัสสินค้าไม่ถูกต้อง'),
  orderedQuantity: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, 'จำนวนที่สั่งต้องเป็นตัวเลขทศนิยมไม่เกิน 3 ตำแหน่ง')
    .refine(v => Number(v) > 0, { message: 'จำนวนที่สั่งต้องมากกว่า 0' }),
  unitCost: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'ราคาต้นทุนต้องเป็นตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง')
    .refine(v => Number(v) >= 0, { message: 'ราคาต้นทุนต้องไม่ติดลบ' }),
}).strict();

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('รหัสผู้จำหน่ายไม่ถูกต้อง'),
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง'),
  note: z.string().trim().max(255).optional().nullable(),
  items: z.array(createPurchaseOrderItemSchema).min(1, 'ต้องมีสินค้าอย่างน้อย 1 รายการ'),
}).strict();

export const receiveGoodsItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid('รหัสรายการ PO ไม่ถูกต้อง'),
  receiveQuantity: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, 'จำนวนที่รับต้องเป็นตัวเลขทศนิยมไม่เกิน 3 ตำแหน่ง')
    .refine(v => Number(v) > 0, { message: 'จำนวนที่รับต้องมากกว่า 0' }),
}).strict();

export const receiveGoodsSchema = z.object({
  items: z.array(receiveGoodsItemSchema).min(1, 'ต้องระบุรายการที่ต้องการตรวจรับอย่างน้อย 1 รายการ'),
}).strict();

export const salesReportQuerySchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(['day', 'month']).default('day'),
}).strict();

export const productReportQuerySchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const vatReportQuerySchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).strict();

export const stockCardReportQuerySchema = z.object({
  productId: z.string().uuid('รหัสสินค้าไม่ถูกต้อง').optional(),
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
}).strict();

export const manualPointAdjustmentSchema = z.object({
  amount: z.number().int().refine(val => val !== 0, { message: 'จำนวนแต้มที่ปรับต้องไม่เป็น 0' }),
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลในการปรับแต้ม').max(200, 'เหตุผลยาวเกินกำหนด'),
}).strict();

export const createLoyaltyRewardSchema = z.object({
  title: z.string().trim().min(1, 'กรุณาระบุชื่อของรางวัล').max(100, 'ชื่อของรางวัลยาวเกินกำหนด'),
  pointsCost: z.number().int().min(1, 'แต้มที่ใช้แลกต้องมากกว่า 0'),
  discountAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'มูลค่าส่วนลดต้องเป็นตัวเลขบวกหรือ 0').default('0'),
}).strict();

export const updateLoyaltyRewardSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  pointsCost: z.number().int().min(1).optional(),
  discountAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).optional(),
  active: z.boolean().optional(),
}).strict();

export const createStockTakeSchema = z.object({
  branchId: z.string().uuid('รหัสสาขาไม่ถูกต้อง'),
  note: z.string().trim().max(255).optional(),
}).strict();

export const updateStockTakeItemSchema = z.object({
  itemId: z.string().uuid('รหัสรายการไม่ถูกต้อง'),
  countedQuantity: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/, 'จำนวนต้องเป็นตัวเลขทศนิยมไม่เกิน 3 ตำแหน่ง')
    .refine(v => Number(v) >= 0, { message: 'จำนวนนับจริงต้องไม่ติดลบ' }),
  note: z.string().trim().max(255).optional(),
}).strict();

export const updateStockTakeCountsSchema = z.object({
  items: z.array(updateStockTakeItemSchema).min(1, 'ต้องระบุรายการที่ต้องการบันทึกอย่างน้อย 1 รายการ'),
}).strict();

export const createTaxInvoiceSchema = z.object({
  customerName: z.string().trim().min(1, 'กรุณาระบุชื่อผู้ซื้อหรือชื่อบริษัท').max(200),
  customerTaxId: z.string().trim().regex(/^(\d{13})?$/, 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก').optional().nullable(),
  customerAddress: z.string().trim().max(300).optional().nullable(),
  customerBranchNumber: z.string().trim().max(10).optional().nullable(),
  customerIsHeadOffice: z.boolean().optional().default(true),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  saveCustomerTaxInfo: z.boolean().optional().default(false),
  note: z.string().trim().max(255).optional().nullable(),
}).strict();

export const updateBranchTaxSettingsSchema = z.object({
  companyName: z.string().trim().max(200).optional().nullable(),
  taxId: z.string().trim().regex(/^(\d{13})?$/, 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก').optional().nullable(),
  taxAddress: z.string().trim().max(300).optional().nullable(),
  branchNumber: z.string().trim().max(10).optional().nullable(),
  isHeadOffice: z.boolean().optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  receiptHeader: z.string().trim().max(255).optional().nullable(),
  receiptFooter: z.string().trim().max(255).optional().nullable(),
}).strict();

export const updateBranchPromptPaySchema = z.object({
  promptPayType: z.enum(['MOBILE', 'TAX_ID', 'EWALLET']).optional(),
  promptPayAccount: z.string().trim().min(9, 'เบอร์พร้อมเพย์ต้องมีอย่างน้อย 9-15 หลัก').max(20).optional().nullable(),
  promptPayName: z.string().trim().max(150).optional().nullable(),
  promptPayBank: z.string().trim().max(50).optional().nullable(),
}).strict();

export const verifySlipSchema = z.object({
  expectedAmount: z.number().positive('ยอดเงินต้องมากกว่า 0'),
  transferRef: z.string().trim().min(4, 'เลขอ้างอิงสลิปต้องมีอย่างน้อย 4 หลัก').max(50),
  slipImageUrl: z.string().trim().url().optional().nullable(),
}).strict();

export const auditQuerySchema = z.object({
  action: z.string().trim().optional(),
  category: z.string().trim().optional(),
  actorUserId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
}).strict();

export const updateLineSettingsSchema = z.object({
  accountName: z.string().trim().min(1, 'กรุณาระบุชื่อบัญชี LINE Official Account').max(100),
  basicId: z.string().trim().max(50).optional().nullable(),
  channelId: z.string().trim().max(100).optional().nullable(),
  channelSecret: z.string().trim().max(100).optional().nullable(),
  channelAccessToken: z.string().trim().max(500).optional().nullable(),
  autoSendReceipt: z.boolean().optional(),
  welcomeMessage: z.string().trim().max(500).optional().nullable(),
  qrCodeUrl: z.string().trim().url().optional().nullable(),
  active: z.boolean().optional(),
  lowStockAlertEnabled: z.boolean().optional(),
  lowStockThreshold: z.coerce.number().int().min(1).max(1000).optional(),
  lowStockTargetUserId: z.string().trim().max(100).optional().nullable(),
}).strict();

export const sendLowStockAlertSchema = z.object({
  branchId: z.string().uuid().optional(),
  targetLineUserId: z.string().trim().max(100).optional(),
  threshold: z.coerce.number().int().min(1).max(1000).optional(),
}).strict();

export const linkCustomerLineSchema = z.object({
  lineUserId: z.string().trim().min(5, 'LINE User ID ต้องมีอย่างน้อย 5 ตัวอักษร').max(100),
  lineDisplayName: z.string().trim().max(100).optional().nullable(),
  linePictureUrl: z.string().trim().url().optional().nullable(),
}).strict();

export const sendLineReceiptSchema = z.object({
  lineUserId: z.string().trim().max(100).optional(),
}).strict();

export const lineReceiptLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict();

export const createSaleReturnSchema = z.object({
  refundMethod: z.enum(['CASH', 'TRANSFER', 'CREDIT_CARD', 'ORIGINAL_PAYMENT']),
  reason: z.string().trim().min(1, 'กรุณาระบุเหตุผลการคืนสินค้า').max(500),
  items: z.array(z.object({
    saleItemId: z.uuid(),
    quantity: z.string().regex(/^\d{1,11}(\.\d{1,3})?$/, 'จำนวนต้องเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง'),
    restock: z.boolean().default(true),
    condition: z.enum(['RESTOCKABLE', 'DAMAGED']).default('RESTOCKABLE'),
    note: z.string().trim().max(300).optional(),
  })).min(1, 'กรุณาเลือกสินค้าที่ต้องการคืนอย่างน้อย 1 รายการ'),
}).strict();

export const returnsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}).strict();

export const updateAuditActionDefinitionSchema = z.object({
  label: z.string().trim().min(1, 'ต้องระบุชื่อเรียก (Label)').max(100, 'ชื่อเรียกต้องไม่เกิน 100 ตัวอักษร'),
  category: z.string().trim().min(1, 'ต้องระบุหมวดหมู่').max(50),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  description: z.string().trim().max(255).optional().nullable(),
}).strict();

export const statusQuerySchema = z.object({
  domain: z.string().trim().max(50).optional(),
}).strict();

export const updateStatusDefinitionSchema = z.object({
  label: z.string().trim().min(1, 'ต้องระบุชื่อเรียกสถานะ (Label)').max(100, 'ชื่อเรียกต้องไม่เกิน 100 ตัวอักษร'),
  color: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'รหัสสีไม่ถูกต้อง (เช่น #16825d)').optional().nullable(),
  bgColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'รหัสสีพื้นหลังไม่ถูกต้อง (เช่น #e8f5ed)').optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isTerminal: z.boolean().optional(),
  description: z.string().trim().max(255).optional().nullable(),
}).strict();

export const updateNavigationMenuSchema = z.object({
  label: z.string().trim().min(1, 'ต้องระบุชื่อเมนู').max(100).optional(),
  icon: z.string().trim().min(1).max(50).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  allowedRoles: z.array(z.enum(['OWNER', 'MANAGER', 'CASHIER'])).min(1, 'ต้องมีสิทธิ์อย่างน้อย 1 บทบาท').optional(),
  active: z.boolean().optional(),
}).strict();

export const createPositionSchema = z.object({
  code: z.string().trim().min(2, 'รหัสตำแหน่งต้องมีอย่างน้อย 2 ตัวอักษร').max(50).regex(/^[A-Z0-9_]+$/, 'รหัสตำแหน่งต้องเป็นตัวพิมพ์ใหญ่ A-Z, 0-9 และ _ เท่านั้น'),
  name: z.string().trim().min(2, 'ต้องระบุชื่อตำแหน่งงาน').max(100),
  description: z.string().trim().max(255).optional().nullable(),
}).strict();

export const updatePositionSchema = z.object({
  name: z.string().trim().min(2, 'ต้องระบุชื่อตำแหน่งงาน').max(100).optional(),
  description: z.string().trim().max(255).optional().nullable(),
  active: z.boolean().optional(),
}).strict();

export const updatePositionPermissionsSchema = z.object({
  permissions: z.array(z.object({
    menuId: z.string().trim().min(1, 'ต้องระบุ menuId'),
    canView: z.boolean(),
    canExport: z.boolean().optional(),
  })).min(1, 'ต้องระบุสิทธิ์อย่างน้อย 1 รายการ'),
}).strict();

export const updateStaffPositionSchema = z.object({
  positionId: z.string().trim().min(1).nullable(),
}).strict();

