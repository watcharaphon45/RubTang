import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransferStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { createTransferSchema, parse } from './validation';

function generateTransferNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = randomBytes(2).toString('hex').toUpperCase();
  return `TR-${yy}${mm}${dd}-${code}`;
}

@Injectable()
export class TransferService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async createTransfer(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์สร้างรายการโอนย้ายสต็อก');
    }

    const input = parse(createTransferSchema, body);
    requireBranch(principal, input.originBranchId);

    return this.db.$transaction(async tx => {
      const [originBranch, destBranch] = await Promise.all([
        tx.branch.findFirst({ where: { id: input.originBranchId, tenantId: principal.tenantId } }),
        tx.branch.findFirst({ where: { id: input.destinationBranchId, tenantId: principal.tenantId } }),
      ]);

      if (!originBranch) throw new NotFoundException('ไม่พบสาขาต้นทาง');
      if (!destBranch) throw new NotFoundException('ไม่พบสาขาปลายทาง');

      const transferNumber = generateTransferNumber();

      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId: principal.tenantId,
          transferNumber,
          originBranchId: input.originBranchId,
          destinationBranchId: input.destinationBranchId,
          createdById: principal.membershipId,
          status: 'IN_TRANSIT',
          notes: input.note || null,
        },
      });

      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId: principal.tenantId },
        });
        if (!product) throw new NotFoundException(`ไม่พบสินค้ารหัส ${item.productId}`);
        if (!product.active) throw new ConflictException(`สินค้า "${product.name}" ปิดการใช้งานอยู่`);

        const originKey = {
          tenantId: principal.tenantId,
          branchId: input.originBranchId,
          productId: item.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: originKey },
        });

        const currentQty = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const reqQty = new Prisma.Decimal(item.quantity);

        if (currentQty.lessThan(reqQty)) {
          throw new ConflictException(
            `สต็อกสินค้า "${product.name}" ที่สาขาต้นทางไม่เพียงพอ (คงเหลือ ${currentQty} ชิ้น, ต้องการโอน ${reqQty} ชิ้น)`,
          );
        }

        const newOriginQty = currentQty.minus(reqQty);

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: originKey },
          create: { ...originKey, quantity: newOriginQty },
          update: { quantity: newOriginQty },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.originBranchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            type: 'TRANSFER_OUT',
            quantity: new Prisma.Decimal(-item.quantity),
            balanceBefore: currentQty,
            balanceAfter: newOriginQty,
            note: `โอนออกไปยัง ${destBranch.name} (${transferNumber})`,
            requestId: `tr-out-${transfer.id}-${item.productId}`,
          },
        });

        await tx.stockTransferItem.create({
          data: {
            transferId: transfer.id,
            productId: item.productId,
            quantity: reqQty,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'TRANSFER_DISPATCHED',
          entityId: transfer.id,
          newValue: {
            transferNumber,
            originBranch: originBranch.name,
            destinationBranch: destBranch.name,
            itemCount: input.items.length,
          },
        },
      });

      return tx.stockTransfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: {
          originBranch: { select: { id: true, name: true } },
          destinationBranch: { select: { id: true, name: true } },
          createdBy: { select: { user: { select: { displayName: true } } } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });
    });
  }

  async receiveTransfer(principal: Principal, transferId: string) {
    const parsedId = parse(z.string().uuid('รหัสรายการโอนไม่ถูกต้อง'), transferId);

    return this.db.$transaction(async tx => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: parsedId, tenantId: principal.tenantId },
        include: {
          items: { include: { product: true } },
          destinationBranch: true,
          originBranch: true,
        },
      });

      if (!transfer) throw new NotFoundException('ไม่พบรายการโอนสินค้า');
      if (transfer.status !== 'IN_TRANSIT') {
        throw new ConflictException(`ไม่สามารถรับสินค้าได้เนื่องจากสถานะปัจจุบันคือ ${transfer.status}`);
      }

      requireBranch(principal, transfer.destinationBranchId);

      for (const item of transfer.items) {
        const destKey = {
          tenantId: principal.tenantId,
          branchId: transfer.destinationBranchId,
          productId: item.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: destKey },
        });

        const before = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const after = before.plus(item.quantity);

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: destKey },
          create: { ...destKey, quantity: after },
          update: { quantity: after },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: transfer.destinationBranchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            balanceBefore: before,
            balanceAfter: after,
            note: `รับเข้าจาก ${transfer.originBranch.name} (${transfer.transferNumber})`,
            requestId: `tr-in-${transfer.id}-${item.productId}`,
          },
        });
      }

      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'COMPLETED',
          receivedAt: new Date(),
          receivedById: principal.membershipId,
        },
        include: {
          originBranch: { select: { id: true, name: true } },
          destinationBranch: { select: { id: true, name: true } },
          createdBy: { select: { user: { select: { displayName: true } } } },
          receivedBy: { select: { user: { select: { displayName: true } } } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'TRANSFER_RECEIVED',
          entityId: transfer.id,
          newValue: {
            transferNumber: transfer.transferNumber,
            receivedAt: updated.receivedAt,
          },
        },
      });

      return updated;
    });
  }

  async cancelTransfer(principal: Principal, transferId: string) {
    const parsedId = parse(z.string().uuid('รหัสรายการโอนไม่ถูกต้อง'), transferId);

    return this.db.$transaction(async tx => {
      const transfer = await tx.stockTransfer.findFirst({
        where: { id: parsedId, tenantId: principal.tenantId },
        include: {
          items: { include: { product: true } },
          originBranch: true,
          destinationBranch: true,
        },
      });

      if (!transfer) throw new NotFoundException('ไม่พบรายการโอนสินค้า');
      if (transfer.status !== 'IN_TRANSIT') {
        throw new ConflictException('สามารถยกเลิกได้เฉพาะรายการที่กำลังขนส่งเท่านั้น');
      }

      requireBranch(principal, transfer.originBranchId);

      // Return stock back to origin branch
      for (const item of transfer.items) {
        const originKey = {
          tenantId: principal.tenantId,
          branchId: transfer.originBranchId,
          productId: item.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: originKey },
        });

        const before = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const after = before.plus(item.quantity);

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: originKey },
          create: { ...originKey, quantity: after },
          update: { quantity: after },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: transfer.originBranchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            balanceBefore: before,
            balanceAfter: after,
            note: `ยกเลิกการโอนสินค้า (${transfer.transferNumber}) คืนสต็อก`,
            requestId: `tr-cancel-${transfer.id}-${item.productId}`,
          },
        });
      }

      const updated = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
        include: {
          originBranch: { select: { id: true, name: true } },
          destinationBranch: { select: { id: true, name: true } },
          createdBy: { select: { user: { select: { displayName: true } } } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'TRANSFER_CANCELLED',
          entityId: transfer.id,
          newValue: {
            transferNumber: transfer.transferNumber,
            cancelledAt: updated.cancelledAt,
          },
        },
      });

      return updated;
    });
  }

  async listTransfers(principal: Principal, branchIdQuery?: unknown, statusQuery?: unknown) {
    let branchId: string | undefined;
    if (branchIdQuery && typeof branchIdQuery === 'string' && branchIdQuery.trim().length > 0) {
      branchId = parse(z.string().uuid(), branchIdQuery);
      requireBranch(principal, branchId);
    }

    let status: TransferStatus | undefined;
    if (statusQuery && typeof statusQuery === 'string' && statusQuery.trim().length > 0) {
      status = parse(z.enum(['IN_TRANSIT', 'COMPLETED', 'CANCELLED']), statusQuery);
    }

    const where: Prisma.StockTransferWhereInput = {
      tenantId: principal.tenantId,
      ...(status ? { status } : {}),
      ...(branchId
        ? {
            OR: [{ originBranchId: branchId }, { destinationBranchId: branchId }],
          }
        : principal.role !== 'OWNER'
        ? {
            OR: [
              { originBranchId: { in: principal.branchIds } },
              { destinationBranchId: { in: principal.branchIds } },
            ],
          }
        : {}),
    };

    return this.db.stockTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        originBranch: { select: { id: true, name: true } },
        destinationBranch: { select: { id: true, name: true } },
        createdBy: { select: { user: { select: { displayName: true } } } },
        receivedBy: { select: { user: { select: { displayName: true } } } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
  }
}
