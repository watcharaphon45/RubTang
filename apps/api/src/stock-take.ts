import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockTakeStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import {
  createStockTakeSchema,
  parse,
  updateStockTakeCountsSchema,
} from './validation';

function generateTakeNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = randomBytes(2).toString('hex').toUpperCase();
  return `ST-${yy}${mm}${dd}-${code}`;
}

@Injectable()
export class StockTakeService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async list(principal: Principal, query: { branchId?: string; status?: StockTakeStatus }) {
    const branchId = query.branchId ? parse(z.string().uuid(), query.branchId) : undefined;
    if (branchId) requireBranch(principal, branchId);

    const takes = await this.db.stockTake.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(branchId ? { branchId } : principal.role === 'OWNER' ? {} : { branchId: { in: principal.branchIds } }),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        branch: { select: { name: true } },
        createdBy: { select: { user: { select: { displayName: true } } } },
        approvedBy: { select: { user: { select: { displayName: true } } } },
        items: {
          select: {
            id: true,
            variance: true,
            varianceValue: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    return takes.map(t => {
      const itemsWithVariance = t.items.filter(i => !i.variance.isZero()).length;
      const totalVarianceValue = t.items.reduce(
        (sum, i) => sum.plus(i.varianceValue),
        new Prisma.Decimal(0),
      );

      return {
        id: t.id,
        takeNumber: t.takeNumber,
        status: t.status,
        branchId: t.branchId,
        branchName: t.branch.name,
        createdByName: t.createdBy.user.displayName,
        approvedByName: t.approvedBy?.user.displayName ?? null,
        note: t.note,
        startedAt: t.startedAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        cancelledAt: t.cancelledAt?.toISOString() ?? null,
        totalItems: t.items.length,
        itemsWithVariance,
        totalVarianceValue: totalVarianceValue.toFixed(2),
      };
    });
  }

  async getById(principal: Principal, idParam: string) {
    const id = parse(z.string().uuid(), idParam);
    const take = await this.db.stockTake.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { user: { select: { displayName: true } } } },
        approvedBy: { select: { user: { select: { displayName: true } } } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
              },
            },
          },
          orderBy: [{ product: { name: 'asc' } }],
        },
      },
    });

    if (!take) throw new NotFoundException('ไม่พบข้อมูลรอบตรวจนับสต็อก');
    requireBranch(principal, take.branchId);

    const itemsWithVariance = take.items.filter(i => !i.variance.isZero()).length;
    const totalVarianceValue = take.items.reduce(
      (sum, i) => sum.plus(i.varianceValue),
      new Prisma.Decimal(0),
    );

    return {
      id: take.id,
      takeNumber: take.takeNumber,
      status: take.status,
      branchId: take.branchId,
      branchName: take.branch.name,
      createdByName: take.createdBy.user.displayName,
      approvedByName: take.approvedBy?.user.displayName ?? null,
      note: take.note,
      startedAt: take.startedAt.toISOString(),
      completedAt: take.completedAt?.toISOString() ?? null,
      cancelledAt: take.cancelledAt?.toISOString() ?? null,
      totalItems: take.items.length,
      itemsWithVariance,
      totalVarianceValue: totalVarianceValue.toFixed(2),
      items: take.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        systemQuantity: item.systemQuantity.toString(),
        countedQuantity: item.countedQuantity.toString(),
        variance: item.variance.toString(),
        unitPrice: item.unitPrice.toFixed(2),
        varianceValue: item.varianceValue.toFixed(2),
        note: item.note,
      })),
    };
  }

  async create(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์เปิดรอบตรวจนับสต็อก');
    }

    const input = parse(createStockTakeSchema, body);
    requireBranch(principal, input.branchId);

    return this.db.$transaction(async tx => {
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, tenantId: principal.tenantId },
      });
      if (!branch) throw new NotFoundException('ไม่พบสาขาที่ระบุ');

      const activeProducts = await tx.product.findMany({
        where: { tenantId: principal.tenantId, active: true },
        select: { id: true, name: true, sku: true, price: true },
      });

      if (activeProducts.length === 0) {
        throw new BadRequestException('ไม่พบสินค้าที่เปิดใช้งานในระบบสำหรับตรวจนับ');
      }

      const balances = await tx.inventoryBalance.findMany({
        where: { tenantId: principal.tenantId, branchId: input.branchId },
      });
      const balanceMap = new Map(balances.map(b => [b.productId, b.quantity]));

      const takeNumber = generateTakeNumber();
      const stockTake = await tx.stockTake.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          takeNumber,
          status: 'IN_PROGRESS',
          createdById: principal.membershipId,
          note: input.note || null,
          items: {
            create: activeProducts.map(p => {
              const currentQty = balanceMap.get(p.id) ?? new Prisma.Decimal(0);
              return {
                productId: p.id,
                systemQuantity: currentQty,
                countedQuantity: currentQty,
                variance: new Prisma.Decimal(0),
                unitPrice: p.price,
                varianceValue: new Prisma.Decimal(0),
              };
            }),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'STOCK_TAKE_CREATED',
          entityId: stockTake.id,
          newValue: {
            takeNumber,
            branchId: input.branchId,
            itemCount: activeProducts.length,
          },
        },
      });

      return stockTake;
    });
  }

  async updateCounts(principal: Principal, idParam: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์บันทึกยอดตรวจนับสต็อก');
    }

    const id = parse(z.string().uuid(), idParam);
    const { items } = parse(updateStockTakeCountsSchema, body);

    return this.db.$transaction(async tx => {
      const take = await tx.stockTake.findFirst({
        where: { id, tenantId: principal.tenantId },
      });
      if (!take) throw new NotFoundException('ไม่พบรอบตรวจนับสต็อก');
      requireBranch(principal, take.branchId);

      if (take.status !== 'IN_PROGRESS') {
        throw new ConflictException('รอบตรวจนับนี้ไม่อยู่ในสถานะที่แก้ไขได้');
      }

      for (const itemInput of items) {
        const item = await tx.stockTakeItem.findFirst({
          where: { id: itemInput.itemId, stockTakeId: id },
        });
        if (!item) continue;

        const countedDecimal = new Prisma.Decimal(itemInput.countedQuantity);
        const varianceDecimal = countedDecimal.minus(item.systemQuantity);
        const varianceValueDecimal = varianceDecimal.mul(item.unitPrice);

        await tx.stockTakeItem.update({
          where: { id: item.id },
          data: {
            countedQuantity: countedDecimal,
            variance: varianceDecimal,
            varianceValue: varianceValueDecimal,
            note: itemInput.note !== undefined ? itemInput.note : item.note,
          },
        });
      }

      return { success: true, updatedCount: items.length };
    });
  }

  async reconcileAndApprove(principal: Principal, idParam: string) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถอนุมัติปรับสต็อกได้');
    }

    const id = parse(z.string().uuid(), idParam);

    return this.db.$transaction(async tx => {
      const take = await tx.stockTake.findFirst({
        where: { id, tenantId: principal.tenantId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });
      if (!take) throw new NotFoundException('ไม่พบรอบตรวจนับสต็อก');
      requireBranch(principal, take.branchId);

      if (take.status !== 'IN_PROGRESS') {
        throw new ConflictException('รอบตรวจนับนี้ไม่ได้อยู่ในสถานะกำลังตรวจนับ');
      }

      // Reconcile items that have a variance
      let adjustedCount = 0;
      for (const item of take.items) {
        if (item.variance.isZero()) continue;

        const key = {
          tenantId: principal.tenantId,
          branchId: take.branchId,
          productId: item.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: key },
        });
        const before = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const after = item.countedQuantity;

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: key },
          update: { quantity: after },
          create: { ...key, quantity: after },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: take.branchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            requestId: crypto.randomUUID(),
            type: 'ADJUSTMENT',
            quantity: item.variance,
            balanceBefore: before,
            balanceAfter: after,
            note: `ปรับยอดจากรอบตรวจนับ ${take.takeNumber}${item.note ? `: ${item.note}` : ' (ตรวจนับจริง)'}`,
          },
        });

        adjustedCount++;
      }

      const now = new Date();
      const updatedTake = await tx.stockTake.update({
        where: { id: take.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          approvedById: principal.membershipId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'STOCK_TAKE_COMPLETED',
          entityId: take.id,
          newValue: {
            takeNumber: take.takeNumber,
            branchId: take.branchId,
            totalItems: take.items.length,
            adjustedItemsCount: adjustedCount,
          },
        },
      });

      return {
        id: updatedTake.id,
        takeNumber: updatedTake.takeNumber,
        status: updatedTake.status,
        completedAt: now.toISOString(),
        adjustedCount,
      };
    });
  }

  async cancel(principal: Principal, idParam: string) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถยกเลิกรอบตรวจนับได้');
    }

    const id = parse(z.string().uuid(), idParam);
    const take = await this.db.stockTake.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!take) throw new NotFoundException('ไม่พบรอบตรวจนับสต็อก');
    requireBranch(principal, take.branchId);

    if (take.status !== 'IN_PROGRESS') {
      throw new ConflictException('สามารถยกเลิกได้เฉพาะรอบตรวจนับที่ยังไม่เสร็จสิ้นเท่านั้น');
    }

    const updated = await this.db.stockTake.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'STOCK_TAKE_CANCELLED',
        entityId: id,
        newValue: { takeNumber: take.takeNumber },
      },
    });

    return {
      id: updated.id,
      takeNumber: updated.takeNumber,
      status: updated.status,
    };
  }
}
