import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { createSaleReturnSchema, parse, returnsQuerySchema } from './validation';

function generateReturnNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = randomBytes(3).toString('hex').toUpperCase();
  return `CN-${yy}${mm}${dd}-${code}`;
}

@Injectable()
export class RefundService {
  constructor(@Inject(Database) private readonly db: Database) {}

  /**
   * ดึงรายการสินค้าที่ยังสามารถคืนได้จากบิลขาย
   */
  async getReturnableItems(principal: Principal, saleId: string) {
    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId: principal.tenantId },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true, points: true } },
      },
    });

    if (!sale) throw new NotFoundException('ไม่พบบิลขาย');
    if (sale.status === 'VOIDED') throw new ConflictException('บิลขายนี้ถูกยกเลิก (Voided) ไม่สามารถคืนสินค้าได้');

    requireBranch(principal, sale.branchId);

    const returnableItems = sale.items
      .map(item => {
        const remainingQty = new Prisma.Decimal(item.quantity).minus(item.returnedQuantity);
        return {
          saleItemId: item.id,
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          unitPrice: Number(item.price),
          originalQuantity: Number(item.quantity),
          returnedQuantity: Number(item.returnedQuantity),
          remainingQuantity: Number(remainingQty),
          lineSubtotal: Number(item.subtotal),
        };
      })
      .filter(item => item.remainingQuantity > 0);

    return {
      sale: {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        status: sale.status,
        total: Number(sale.total),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        pointsEarned: sale.pointsEarned,
        pointsRedeemed: sale.pointsRedeemed,
        paymentMethod: sale.paymentMethod,
        createdAt: sale.createdAt,
        branch: sale.branch,
        customer: sale.customer,
      },
      items: returnableItems,
    };
  }

  /**
   * สร้างรายการคืนสินค้าและคืนเงิน (Partial Return / Full Return)
   */
  async createReturn(principal: Principal, saleId: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะ Manager หรือ Owner เท่านั้นที่สามารถดำเนินการคืนสินค้าได้');
    }

    const input = parse(createSaleReturnSchema, body);

    return this.db.$transaction(async tx => {
      // 1. ดึงข้อมูลบิลขายพร้อมรายการสินค้า
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId: principal.tenantId },
        include: {
          items: true,
          branch: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true, points: true, lifetimePoints: true } },
        },
      });

      if (!sale) throw new NotFoundException('ไม่พบบิลขาย');
      if (sale.status === 'VOIDED') throw new ConflictException('บิลขายนี้ถูกยกเลิก (Voided) ไม่สามารถคืนสินค้าได้');

      requireBranch(principal, sale.branchId);

      const returnNumber = generateReturnNumber();
      let subtotalRefund = new Prisma.Decimal(0);

      // คำนวณอัตราส่วนส่วนลดทั้งบิล
      const saleSubtotal = new Prisma.Decimal(sale.subtotal);
      const saleDiscount = new Prisma.Decimal(sale.discount);
      // discount ratio = discount / subtotal (ถ้า subtotal = 0 ไม่มีส่วนลด)
      const discountRatio = saleSubtotal.isZero()
        ? new Prisma.Decimal(0)
        : saleDiscount.div(saleSubtotal);

      const returnItemsData: {
        saleItemId: string;
        productId: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discount: Prisma.Decimal;
        refundAmount: Prisma.Decimal;
        restock: boolean;
        condition: 'RESTOCKABLE' | 'DAMAGED';
        note?: string;
      }[] = [];

      // 2. ประมวลผลแต่ละรายการที่ต้องการคืน
      for (const returnItem of input.items) {
        const saleItem = sale.items.find(i => i.id === returnItem.saleItemId);
        if (!saleItem) {
          throw new NotFoundException(`ไม่พบรายการสินค้า ${returnItem.saleItemId} ในบิลขายนี้`);
        }

        const returnQty = new Prisma.Decimal(returnItem.quantity);
        const remaining = new Prisma.Decimal(saleItem.quantity).minus(saleItem.returnedQuantity);

        if (returnQty.lessThanOrEqualTo(0)) {
          throw new BadRequestException(`จำนวนคืนสินค้า "${saleItem.name}" ต้องมากกว่า 0`);
        }

        if (returnQty.greaterThan(remaining)) {
          throw new ConflictException(
            `สินค้า "${saleItem.name}" จำนวนคืน (${returnQty}) เกินจำนวนที่เหลือ (${remaining})`
          );
        }

        // คำนวณยอดคืนเงิน: (unitPrice × qty) - pro-rated discount
        const lineGross = new Prisma.Decimal(saleItem.price).mul(returnQty);
        const lineDiscount = lineGross.mul(discountRatio).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const lineRefund = lineGross.minus(lineDiscount);

        subtotalRefund = subtotalRefund.plus(lineRefund);

        returnItemsData.push({
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          quantity: returnQty,
          unitPrice: new Prisma.Decimal(saleItem.price),
          discount: lineDiscount,
          refundAmount: lineRefund,
          restock: returnItem.restock,
          condition: returnItem.condition,
          note: returnItem.note,
        });

        // 3. อัปเดต returnedQuantity ใน SaleItem
        await tx.saleItem.update({
          where: { id: saleItem.id },
          data: {
            returnedQuantity: new Prisma.Decimal(saleItem.returnedQuantity).plus(returnQty),
          },
        });

        // 4. Restock: ปรับยอดสต็อกคลัง (ถ้า restock = true)
        if (returnItem.restock) {
          const invKey = {
            tenantId: principal.tenantId,
            branchId: sale.branchId,
            productId: saleItem.productId,
          };

          const currentBalance = await tx.inventoryBalance.findUnique({
            where: { tenantId_branchId_productId: invKey },
          });

          const before = currentBalance?.quantity ?? new Prisma.Decimal(0);
          const after = before.plus(returnQty);

          await tx.inventoryBalance.upsert({
            where: { tenantId_branchId_productId: invKey },
            create: { ...invKey, quantity: after },
            update: { quantity: after },
          });

          await tx.stockMovement.create({
            data: {
              tenantId: principal.tenantId,
              branchId: sale.branchId,
              productId: saleItem.productId,
              actorMembershipId: principal.membershipId,
              requestId: crypto.randomUUID(),
              type: 'RETURN',
              quantity: returnQty,
              balanceBefore: before,
              balanceAfter: after,
              note: `คืนสินค้าจากบิล ${sale.receiptNumber} (ใบลดหนี้ ${returnNumber})`,
            },
          });
        }
      }

      // 5. คำนวณ VAT (7%) จากยอดคืนสุทธิ
      const vatRate = new Prisma.Decimal('0.07');
      // subtotalRefund includes VAT, so vatRefund = subtotalRefund × 7/107
      const vatRefund = subtotalRefund.mul(new Prisma.Decimal(7)).div(new Prisma.Decimal(107)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const totalRefund = subtotalRefund;

      // 6. หักแต้มสะสมที่ได้รับจากบิลนี้ตามสัดส่วน
      let pointsDeducted = 0;
      if (sale.customer && sale.pointsEarned > 0) {
        // สัดส่วนมูลค่าที่คืน ÷ มูลค่าทั้งบิล
        const saleTotal = new Prisma.Decimal(sale.total);
        if (!saleTotal.isZero()) {
          const refundRatio = totalRefund.div(saleTotal);
          pointsDeducted = Math.floor(refundRatio.mul(sale.pointsEarned).toNumber());

          if (pointsDeducted > 0) {
            const newPoints = Math.max(0, sale.customer.points - pointsDeducted);

            await tx.customer.update({
              where: { tenantId_id: { tenantId: principal.tenantId, id: sale.customer.id } },
              data: { points: newPoints },
            });

            await tx.pointLedger.create({
              data: {
                tenantId: principal.tenantId,
                customerId: sale.customer.id,
                saleId: sale.id,
                actorMembershipId: principal.membershipId,
                type: 'REVERT',
                amount: -pointsDeducted,
                balanceAfter: newPoints,
                reason: `หักแต้มคืนจากการคืนสินค้า ใบลดหนี้ ${returnNumber}`,
              },
            });
          }
        }
      }

      // 7. สร้าง SaleReturn record
      const saleReturn = await tx.saleReturn.create({
        data: {
          tenantId: principal.tenantId,
          branchId: sale.branchId,
          saleId: sale.id,
          returnNumber,
          refundMethod: input.refundMethod,
          subtotalRefund,
          vatRefund,
          totalRefund,
          pointsDeducted,
          reason: input.reason,
          processedById: principal.membershipId,
          items: {
            create: returnItemsData.map(item => ({
              saleItemId: item.saleItemId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              refundAmount: item.refundAmount,
              restock: item.restock,
              condition: item.condition,
              note: item.note,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      });

      // 8. อัปเดตสถานะบิลขาย
      // ตรวจสอบว่าสินค้าทุกรายการคืนครบหรือยัง
      const updatedItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });

      const allFullyReturned = updatedItems.every(item =>
        new Prisma.Decimal(item.returnedQuantity).greaterThanOrEqualTo(item.quantity)
      );

      if (allFullyReturned) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: 'VOIDED', voidedAt: new Date(), voidedById: principal.membershipId, voidReason: `คืนสินค้าทั้งหมด - ${input.reason}` },
        });
      } else {
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: 'PARTIALLY_RETURNED' },
        });
      }

      // 9. บันทึก Audit Log
      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'SALE_RETURN_CREATED',
          entityId: saleReturn.id,
          newValue: {
            returnNumber,
            receiptNumber: sale.receiptNumber,
            saleId: sale.id,
            totalRefund: Number(totalRefund),
            itemCount: returnItemsData.length,
            refundMethod: input.refundMethod,
            reason: input.reason,
            pointsDeducted,
            customerName: sale.customer?.name || null,
          },
        },
      });

      return {
        id: saleReturn.id,
        returnNumber: saleReturn.returnNumber,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        branch: sale.branch,
        customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null,
        refundMethod: saleReturn.refundMethod,
        subtotalRefund: Number(saleReturn.subtotalRefund),
        vatRefund: Number(saleReturn.vatRefund),
        totalRefund: Number(saleReturn.totalRefund),
        pointsDeducted: saleReturn.pointsDeducted,
        reason: saleReturn.reason,
        items: saleReturn.items.map(item => ({
          id: item.id,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          refundAmount: Number(item.refundAmount),
          restock: item.restock,
          condition: item.condition,
          note: item.note,
        })),
        createdAt: saleReturn.createdAt,
        allFullyReturned,
      };
    });
  }

  /**
   * ดึงรายการคืนสินค้าทั้งหมดของร้าน
   */
  async listReturns(principal: Principal, query: unknown) {
    const { branchId, startDate, endDate, limit = 50, offset = 0 } = parse(returnsQuerySchema, query);

    if (branchId) requireBranch(principal, branchId);

    const where: Prisma.SaleReturnWhereInput = {
      tenantId: principal.tenantId,
    };

    if (branchId) where.branchId = branchId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [items, total] = await Promise.all([
      this.db.saleReturn.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          sale: { select: { receiptNumber: true } },
          branch: { select: { id: true, name: true } },
          processedBy: {
            select: {
              user: { select: { displayName: true } },
            },
          },
          items: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
        },
      }),
      this.db.saleReturn.count({ where }),
    ]);

    return {
      items: items.map(r => ({
        id: r.id,
        returnNumber: r.returnNumber,
        receiptNumber: r.sale.receiptNumber,
        branch: r.branch,
        refundMethod: r.refundMethod,
        totalRefund: Number(r.totalRefund),
        pointsDeducted: r.pointsDeducted,
        reason: r.reason,
        processedBy: r.processedBy.user.displayName,
        itemCount: r.items.length,
        items: r.items.map(item => ({
          productName: item.product.name,
          sku: item.product.sku,
          quantity: Number(item.quantity),
          refundAmount: Number(item.refundAmount),
          restock: item.restock,
          condition: item.condition,
        })),
        createdAt: r.createdAt,
      })),
      total,
    };
  }

  /**
   * ดึงรายละเอียดใบลดหนี้ (Credit Note)
   */
  async getReturnById(principal: Principal, returnId: string) {
    const saleReturn = await this.db.saleReturn.findFirst({
      where: { id: returnId, tenantId: principal.tenantId },
      include: {
        sale: {
          select: {
            receiptNumber: true,
            subtotal: true,
            discount: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            companyName: true,
            taxId: true,
            taxAddress: true,
            branchNumber: true,
            isHeadOffice: true,
            phone: true,
          },
        },
        processedBy: {
          select: {
            user: { select: { displayName: true, email: true } },
          },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    if (!saleReturn) throw new NotFoundException('ไม่พบใบลดหนี้');

    requireBranch(principal, saleReturn.branchId);

    return {
      id: saleReturn.id,
      returnNumber: saleReturn.returnNumber,
      refundMethod: saleReturn.refundMethod,
      subtotalRefund: Number(saleReturn.subtotalRefund),
      vatRefund: Number(saleReturn.vatRefund),
      totalRefund: Number(saleReturn.totalRefund),
      pointsDeducted: saleReturn.pointsDeducted,
      reason: saleReturn.reason,
      createdAt: saleReturn.createdAt,
      processedBy: {
        name: saleReturn.processedBy.user.displayName,
        email: saleReturn.processedBy.user.email,
      },
      sale: {
        receiptNumber: saleReturn.sale.receiptNumber,
        subtotal: Number(saleReturn.sale.subtotal),
        discount: Number(saleReturn.sale.discount),
        total: Number(saleReturn.sale.total),
        paymentMethod: saleReturn.sale.paymentMethod,
        createdAt: saleReturn.sale.createdAt,
        customer: saleReturn.sale.customer,
      },
      branch: saleReturn.branch,
      items: saleReturn.items.map(item => ({
        id: item.id,
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        refundAmount: Number(item.refundAmount),
        restock: item.restock,
        condition: item.condition,
        note: item.note,
      })),
    };
  }

  /**
   * ดึงประวัติการคืนสินค้าของบิลขายเฉพาะ
   */
  async getSaleReturns(principal: Principal, saleId: string) {
    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId: principal.tenantId },
      select: { id: true, branchId: true, receiptNumber: true },
    });

    if (!sale) throw new NotFoundException('ไม่พบบิลขาย');

    requireBranch(principal, sale.branchId);

    const returns = await this.db.saleReturn.findMany({
      where: { saleId, tenantId: principal.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        processedBy: {
          select: {
            user: { select: { displayName: true } },
          },
        },
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
      },
    });

    return {
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      returns: returns.map(r => ({
        id: r.id,
        returnNumber: r.returnNumber,
        refundMethod: r.refundMethod,
        totalRefund: Number(r.totalRefund),
        pointsDeducted: r.pointsDeducted,
        reason: r.reason,
        processedBy: r.processedBy.user.displayName,
        items: r.items.map(item => ({
          productName: item.product.name,
          sku: item.product.sku,
          quantity: Number(item.quantity),
          refundAmount: Number(item.refundAmount),
          restock: item.restock,
          condition: item.condition,
        })),
        createdAt: r.createdAt,
      })),
    };
  }
}
