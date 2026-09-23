import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { movementSchema, parse } from './validation';

type MovementInput = z.infer<typeof movementSchema>;
type Replay = Omit<MovementInput, 'quantity' | 'type'> & {
  type: MovementType;
  actorMembershipId: string;
  quantity: Prisma.Decimal;
};

export function assertReplay(existing: Replay, input: MovementInput, principal: Principal) {
  if (existing.branchId !== input.branchId || existing.productId !== input.productId || existing.type !== input.type ||
    existing.note !== input.note || existing.actorMembershipId !== principal.membershipId || !existing.quantity.equals(input.quantity)) {
    throw new ConflictException('รหัสคำขอนี้ถูกใช้กับรายการอื่นแล้ว กรุณาตรวจสอบประวัติสต็อก');
  }
}

export function nextBalance(before: Prisma.Decimal, delta: Prisma.Decimal) {
  const after = before.plus(delta);
  if (after.isNegative()) throw new ConflictException('สต็อกไม่เพียงพอสำหรับการปรับลด');
  if (after.greaterThan('99999999999.999')) throw new ConflictException('ยอดสต็อกเกินขอบเขตที่รองรับ');
  return after;
}

@Injectable()
export class InventoryService {
  constructor(@Inject(Database) private readonly db: Database) {}

  private async checkBranch(tx: Prisma.TransactionClient, principal: Principal, branchId: string) {
    requireBranch(principal, branchId);
    if (!await tx.branch.findFirst({ where: { id: branchId, tenantId: principal.tenantId } })) throw new NotFoundException('ไม่พบสาขา');
  }

  async history(principal: Principal, branchId: unknown, productId: unknown, cursor: unknown) {
    const branch = parse(z.uuid(), branchId);
    const product = parse(z.uuid().optional(), productId);
    const page = parse(z.object({ at: z.iso.datetime(), id: z.uuid() }).optional(),
      cursor === undefined ? undefined : (() => { try { return JSON.parse(String(cursor)); } catch { return null; } })());
    await this.checkBranch(this.db, principal, branch);
    const rows = await this.db.stockMovement.findMany({
      where: {
        tenantId: principal.tenantId, branchId: branch, ...(product ? { productId: product } : {}),
        ...(page ? { OR: [{ createdAt: { lt: new Date(page.at) } }, { createdAt: new Date(page.at), id: { lt: page.id } }] } : {}),
      },
      include: { product: { select: { name: true, sku: true } }, actor: { select: { user: { select: { displayName: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
    });
    const items = rows.slice(0, 50);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > 50 && last ? JSON.stringify({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  async record(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์ปรับสต็อก');
    const input = parse(movementSchema, body);
    requireBranch(principal, input.branchId);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.db.$transaction(async tx => {
          await this.checkBranch(tx, principal, input.branchId);
          const existing = await tx.stockMovement.findUnique({ where: { tenantId_requestId: { tenantId: principal.tenantId, requestId: input.requestId } } });
          if (existing) { assertReplay(existing, input, principal); return existing; }
          const product = await tx.product.findFirst({ where: { tenantId: principal.tenantId, id: input.productId } });
          if (!product) throw new NotFoundException('ไม่พบสินค้า');
          if (!product.active) throw new ConflictException('สินค้าปิดใช้งานอยู่ กรุณาเปิดใช้งานก่อนปรับสต็อก');
          const key = { tenantId: principal.tenantId, branchId: input.branchId, productId: input.productId };
          const current = await tx.inventoryBalance.findUnique({ where: { tenantId_branchId_productId: key } });
          const before = current?.quantity ?? new Prisma.Decimal(0);
          const delta = new Prisma.Decimal(input.quantity);
          const after = nextBalance(before, delta);
          await tx.inventoryBalance.upsert({ where: { tenantId_branchId_productId: key }, create: { ...key, quantity: after }, update: { quantity: after } });
          const movement = await tx.stockMovement.create({ data: { ...input, tenantId: principal.tenantId, actorMembershipId: principal.membershipId, quantity: delta, balanceBefore: before, balanceAfter: after } });
          await tx.auditLog.create({ data: {
            tenantId: principal.tenantId, actorUserId: principal.userId, action: `STOCK_${input.type}`, entityId: movement.id,
            oldValue: { quantity: before.toString() },
            newValue: { branchId: input.branchId, productId: input.productId, quantity: after.toString(), delta: delta.toString(), note: input.note, requestId: input.requestId },
          } });
          return movement;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
          if (attempt < 3) continue;
          throw new ConflictException('มีรายการสต็อกพร้อมกัน กรุณาลองส่งคำขอเดิมอีกครั้ง');
        }
        throw error;
      }
    }
    throw new ConflictException('กรุณาลองส่งคำขอเดิมอีกครั้ง');
  }
}
