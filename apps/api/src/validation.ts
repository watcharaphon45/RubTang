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
