import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { checkoutSchema, parse, voidSaleSchema } from './validation';
import { calculateTier } from './loyalty';


function generateReceiptNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = randomBytes(3).toString('hex').toUpperCase();
  return `REC-${yy}${mm}${dd}-${code}`;
}

@Injectable()
export class CheckoutService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async processCheckout(principal: Principal, body: unknown) {
    const input = parse(checkoutSchema, body);
    requireBranch(principal, input.branchId);

    return this.db.$transaction(async tx => {
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, tenantId: principal.tenantId },
        select: { id: true, name: true },
      });
      if (!branch) throw new NotFoundException('ไม่พบสาขา');

      const receiptNumber = generateReceiptNumber();

      let subtotalDecimal = new Prisma.Decimal(0);
      const computedItems: {
        productId: string;
        name: string;
        sku: string;
        price: Prisma.Decimal;
        quantity: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }[] = [];

      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId: principal.tenantId },
        });
        if (!product) throw new NotFoundException(`ไม่พบสินค้ารหัส ${item.productId}`);
        if (!product.active) throw new ConflictException(`สินค้า "${product.name}" ปิดการใช้งานอยู่`);

        const key = {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          productId: item.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: key },
        });

        const before = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const qtyDecimal = new Prisma.Decimal(item.quantity);

        if (before.lessThan(qtyDecimal)) {
          throw new ConflictException(
            `สินค้า "${product.name}" มีสต็อกไม่เพียงพอ (ต้องการ ${qtyDecimal.toString()} ชิ้น แต่คงเหลือ ${before.toString()} ชิ้น)`
          );
        }

        const after = before.minus(qtyDecimal);

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: key },
          create: { ...key, quantity: after },
          update: { quantity: after },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            requestId: crypto.randomUUID(),
            type: 'SALE',
            quantity: qtyDecimal.negated(),
            balanceBefore: before,
            balanceAfter: after,
            note: `ขายหน้าร้าน ใบเสร็จ ${receiptNumber}`,
          },
        });

        const lineSubtotal = product.price.mul(qtyDecimal);
        subtotalDecimal = subtotalDecimal.plus(lineSubtotal);

        computedItems.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: qtyDecimal,
          subtotal: lineSubtotal,
        });
      }

      const discountDecimal = new Prisma.Decimal(input.discount || '0');
      if (discountDecimal.greaterThan(subtotalDecimal)) {
        throw new BadRequestException('ส่วนลดต้องไม่เกินยอดรวมสินค้า');
      }

      const remainingPayable = subtotalDecimal.minus(discountDecimal);
      const pointsRedeemed = input.redeemPoints || 0;
      let pointsDiscountDecimal = new Prisma.Decimal(0);
      let customerRecord: { id: string; name: string; phone: string } | null = null;

      if (input.customerId) {
        const cust = await tx.customer.findFirst({
          where: { id: input.customerId, tenantId: principal.tenantId },
        });
        if (!cust) throw new NotFoundException('ไม่พบข้อมูลลูกค้าที่ระบุ');
        customerRecord = { id: cust.id, name: cust.name, phone: cust.phone };

        if (pointsRedeemed > 0) {
          if (cust.points < pointsRedeemed) {
            throw new BadRequestException(`แต้มสะสมของลูกค้าไม่เพียงพอ (มีอยู่ ${cust.points} แต้ม)`);
          }
          // 1 point = 1 Baht discount
          pointsDiscountDecimal = new Prisma.Decimal(pointsRedeemed);
          if (pointsDiscountDecimal.greaterThan(remainingPayable)) {
            throw new BadRequestException('ส่วนลดจากแต้มสะสมต้องไม่เกินยอดคงเหลือหลังหักส่วนลด');
          }
        }
      } else if (pointsRedeemed > 0) {
        throw new BadRequestException('ต้องระบุลูกค้าหากต้องการใช้แต้มสะสมแลกส่วนลด');
      }

      const totalDecimal = remainingPayable.minus(pointsDiscountDecimal);

      let changeDecimal = new Prisma.Decimal(0);
      let receivedDecimal = totalDecimal;

      if (input.paymentMethod === 'CASH') {
        receivedDecimal = new Prisma.Decimal(input.receivedAmount || totalDecimal.toString());
        if (receivedDecimal.lessThan(totalDecimal)) {
          throw new BadRequestException('เงินสดที่รับมาไม่เพียงพอกับยอดชำระ');
        }
        changeDecimal = receivedDecimal.minus(totalDecimal);
      }

      const activeShift = await tx.shift.findFirst({
        where: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          status: 'OPEN',
        },
        select: { id: true },
      });

      const sale = await tx.sale.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          shiftId: activeShift?.id,
          cashierId: principal.membershipId,
          customerId: customerRecord?.id,
          receiptNumber,
          subtotal: subtotalDecimal,
          discount: discountDecimal,
          pointsDiscount: pointsDiscountDecimal,
          pointsRedeemed,
          pointsEarned: 0,
          total: totalDecimal,
          paymentMethod: input.paymentMethod,
          paymentDetail: input.paymentMethod === 'TRANSFER' ? { transferRef: input.transferRef } : undefined,
          items: {
            create: computedItems.map(item => ({
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              price: item.price,
              quantity: item.quantity,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          items: true,
          cashier: {
            select: { user: { select: { displayName: true } } },
          },
        },
      });

      let pointsEarned = 0;
      if (input.customerId && customerRecord) {
        const cust = await tx.customer.findFirstOrThrow({
          where: { id: input.customerId, tenantId: principal.tenantId },
        });

        let currentPoints = cust.points;

        if (pointsRedeemed > 0) {
          currentPoints -= pointsRedeemed;
          await tx.pointLedger.create({
            data: {
              tenantId: principal.tenantId,
              customerId: cust.id,
              saleId: sale.id,
              actorMembershipId: principal.membershipId,
              type: 'REDEEM',
              amount: -pointsRedeemed,
              balanceAfter: currentPoints,
              reason: `ใช้แลกส่วนลดบิล ${receiptNumber}`,
            },
          });
        }

        pointsEarned = Math.floor(Number(totalDecimal) / 50);
        if (pointsEarned > 0) {
          currentPoints += pointsEarned;
          const newLifetime = cust.lifetimePoints + pointsEarned;
          const newTier = calculateTier(newLifetime);

          await tx.customer.update({
            where: { id: cust.id },
            data: {
              points: currentPoints,
              lifetimePoints: newLifetime,
              tier: newTier,
            },
          });

          await tx.pointLedger.create({
            data: {
              tenantId: principal.tenantId,
              customerId: cust.id,
              saleId: sale.id,
              actorMembershipId: principal.membershipId,
              type: 'EARN',
              amount: pointsEarned,
              balanceAfter: currentPoints,
              reason: `สะสมแต้มจากบิล ${receiptNumber}`,
            },
          });
        } else if (pointsRedeemed > 0) {
          await tx.customer.update({
            where: { id: cust.id },
            data: {
              points: currentPoints,
            },
          });
        }

        await tx.sale.update({
          where: { id: sale.id },
          data: { pointsEarned },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'SALE_COMPLETED',
          entityId: sale.id,
          newValue: {
            receiptNumber,
            total: totalDecimal.toFixed(2),
            itemCount: computedItems.length,
            customerId: customerRecord?.id,
            pointsEarned,
            pointsRedeemed,
            pointsDiscount: pointsDiscountDecimal.toFixed(2),
          },
        },
      });

      return {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        createdAt: sale.createdAt.toISOString(),
        branch: { id: branch.id, name: branch.name },
        cashier: { displayName: sale.cashier.user.displayName },
        customer: customerRecord ? { ...customerRecord, pointsEarned, pointsRedeemed } : null,
        subtotal: subtotalDecimal.toFixed(2),
        discount: discountDecimal.toFixed(2),
        pointsDiscount: pointsDiscountDecimal.toFixed(2),
        pointsRedeemed,
        pointsEarned,
        total: totalDecimal.toFixed(2),
        paymentMethod: sale.paymentMethod,
        receivedAmount: receivedDecimal.toFixed(2),
        change: changeDecimal.toFixed(2),
        transferRef: input.transferRef,
        items: computedItems.map(item => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          price: item.price.toFixed(2),
          quantity: item.quantity.toString(),
          subtotal: item.subtotal.toFixed(2),
        })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listSales(principal: Principal, branchIdQuery: unknown) {
    const branchId = parse(z.string().uuid(), branchIdQuery);
    requireBranch(principal, branchId);

    const sales = await this.db.sale.findMany({
      where: { tenantId: principal.tenantId, branchId },
      include: {
        items: true,
        cashier: { select: { user: { select: { displayName: true } } } },
        voidedBy: { select: { user: { select: { displayName: true } } } },
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return sales.map(s => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      branchName: s.branch.name,
      cashierName: s.cashier.user.displayName,
      voidedAt: s.voidedAt?.toISOString() ?? null,
      voidedByName: s.voidedBy?.user.displayName ?? null,
      voidReason: s.voidReason ?? null,
      customer: s.customer ? { id: s.customer.id, name: s.customer.name, phone: s.customer.phone } : null,
      subtotal: s.subtotal.toFixed(2),
      discount: s.discount.toFixed(2),
      total: s.total.toFixed(2),
      paymentMethod: s.paymentMethod,
      items: s.items.map(item => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        price: item.price.toFixed(2),
        quantity: item.quantity.toString(),
        subtotal: item.subtotal.toFixed(2),
      })),
    }));
  }

  async voidSale(principal: Principal, saleId: string, body: unknown) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถยกเลิกบิลได้');
    }

    const { reason } = parse(voidSaleSchema, body);

    return this.db.$transaction(async tx => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId: principal.tenantId },
        include: {
          items: true,
          customer: true,
        },
      });
      if (!sale) throw new NotFoundException('ไม่พบรายการขาย');
      requireBranch(principal, sale.branchId);

      if (sale.status === 'VOIDED') {
        throw new ConflictException('รายการขายนี้ถูกยกเลิกไปแล้ว');
      }

      // 1. คืนสต็อกเข้าสาขา
      for (const item of sale.items) {
        const balance = await tx.inventoryBalance.findUnique({
          where: {
            tenantId_branchId_productId: {
              tenantId: principal.tenantId,
              branchId: sale.branchId,
              productId: item.productId,
            },
          },
        });

        const before = balance?.quantity ?? new Prisma.Decimal(0);
        const after = before.add(item.quantity);

        await tx.inventoryBalance.upsert({
          where: {
            tenantId_branchId_productId: {
              tenantId: principal.tenantId,
              branchId: sale.branchId,
              productId: item.productId,
            },
          },
          update: { quantity: after },
          create: {
            tenantId: principal.tenantId,
            branchId: sale.branchId,
            productId: item.productId,
            quantity: after,
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: sale.branchId,
            productId: item.productId,
            actorMembershipId: principal.membershipId,
            requestId: crypto.randomUUID(),
            type: 'VOID_SALE',
            quantity: item.quantity,
            balanceBefore: before,
            balanceAfter: after,
            note: `ยกเลิกบิล ${sale.receiptNumber}: ${reason}`,
          },
        });
      }

      // 2. ปรับปรุงแต้มสะสมของลูกค้า (ถ้ามี)
      if (sale.customerId && sale.customer) {
        const currentCust = (tx.customer.findUnique ? await tx.customer.findUnique({ where: { id: sale.customerId } }) : null) || (tx.customer.findFirst ? await tx.customer.findFirst({ where: { id: sale.customerId } }) : null) || (sale.customer as any);

        if (currentCust) {
          let runningPoints = currentCust.points ?? 0;
          let runningLifetime = currentCust.lifetimePoints ?? 0;
          const pointsEarnedToRevert = (sale.pointsEarned !== undefined && sale.pointsEarned > 0) ? sale.pointsEarned : Math.floor(Number(sale.total) / 50);

          // ถ้าบิลนี้เคยได้แต้ม (pointsEarned) ให้ดึงแต้มคืน
          if (pointsEarnedToRevert > 0) {
            runningPoints = Math.max(0, runningPoints - pointsEarnedToRevert);
            runningLifetime = Math.max(0, runningLifetime - pointsEarnedToRevert);

            if (tx.pointLedger?.create) {
              await tx.pointLedger.create({
                data: {
                  tenantId: principal.tenantId,
                  customerId: currentCust.id,
                  saleId: sale.id,
                  actorMembershipId: principal.membershipId,
                  type: 'REVERT',
                  amount: -pointsEarnedToRevert,
                  balanceAfter: runningPoints,
                  reason: `ดึงแต้มคืนจากการยกเลิกบิล ${sale.receiptNumber}`,
                },
              });
            }
          }

          // ถ้าบิลนี้เคยใช้แต้มแลกส่วนลด (pointsRedeemed) ให้คืนแต้มให้ลูกค้า
          if (sale.pointsRedeemed && sale.pointsRedeemed > 0) {
            runningPoints += sale.pointsRedeemed;

            if (tx.pointLedger?.create) {
              await tx.pointLedger.create({
                data: {
                  tenantId: principal.tenantId,
                  customerId: currentCust.id,
                  saleId: sale.id,
                  actorMembershipId: principal.membershipId,
                  type: 'REVERT',
                  amount: sale.pointsRedeemed,
                  balanceAfter: runningPoints,
                  reason: `คืนแต้มที่ใช้แลกจากการยกเลิกบิล ${sale.receiptNumber}`,
                },
              });
            }
          }

          if (pointsEarnedToRevert > 0 || (sale.pointsRedeemed && sale.pointsRedeemed > 0)) {
            const newTier = calculateTier(runningLifetime);
            await tx.customer.update({
              where: { id: currentCust.id },
              data: {
                points: runningPoints,
                lifetimePoints: runningLifetime,
                tier: newTier,
              },
            });
          }
        }
      }

      // 3. ปรับปรุงสถานะบิล
      const now = new Date();
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'VOIDED',
          voidedAt: now,
          voidedById: principal.membershipId,
          voidReason: reason,
        },
        include: {
          branch: { select: { name: true } },
          cashier: { select: { user: { select: { displayName: true } } } },
          voidedBy: { select: { user: { select: { displayName: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'SALE_VOID',
          entityId: sale.id,
          oldValue: { status: 'COMPLETED' },
          newValue: {
            status: 'VOIDED',
            receiptNumber: sale.receiptNumber,
            reason,
            voidedByMembershipId: principal.membershipId,
          },
        },
      });

      return {
        id: updatedSale.id,
        receiptNumber: updatedSale.receiptNumber,
        status: updatedSale.status,
        createdAt: updatedSale.createdAt.toISOString(),
        branchName: updatedSale.branch.name,
        cashierName: updatedSale.cashier.user.displayName,
        voidedAt: updatedSale.voidedAt?.toISOString() ?? null,
        voidedByName: updatedSale.voidedBy?.user.displayName ?? null,
        voidReason: updatedSale.voidReason,
        customer: updatedSale.customer,
        subtotal: updatedSale.subtotal.toFixed(2),
        discount: updatedSale.discount.toFixed(2),
        total: updatedSale.total.toFixed(2),
        paymentMethod: updatedSale.paymentMethod,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

