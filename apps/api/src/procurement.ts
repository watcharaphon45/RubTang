import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import {
  createPurchaseOrderSchema,
  createSupplierSchema,
  parse,
  receiveGoodsSchema,
  updateSupplierSchema,
} from './validation';

function generatePoNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = randomBytes(2).toString('hex').toUpperCase();
  return `PO-${yy}${mm}${dd}-${code}`;
}

@Injectable()
export class ProcurementService {
  constructor(@Inject(Database) private readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // SUPPLIERS
  // ---------------------------------------------------------------------------

  async listSuppliers(principal: Principal, search?: string) {
    const where: Prisma.SupplierWhereInput = {
      tenantId: principal.tenantId,
      ...(search?.trim()
        ? {
            OR: [
              { name: { contains: search.trim(), mode: 'insensitive' } },
              { contactName: { contains: search.trim(), mode: 'insensitive' } },
              { phone: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const suppliers = await this.db.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { purchaseOrders: true },
        },
      },
    });

    return suppliers.map(s => ({
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      creditDays: s.creditDays,
      active: s.active,
      poCount: s._count.purchaseOrders,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async createSupplier(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์จัดการข้อมูลผู้จำหน่าย');
    }

    const input = parse(createSupplierSchema, body);

    const supplier = await this.db.supplier.create({
      data: {
        tenantId: principal.tenantId,
        name: input.name,
        contactName: input.contactName ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        creditDays: input.creditDays ?? 0,
        active: true,
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'SUPPLIER_CREATED',
        entityId: supplier.id,
        newValue: {
          name: supplier.name,
          contactName: supplier.contactName,
          phone: supplier.phone,
        },
      },
    });

    return {
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      creditDays: supplier.creditDays,
      active: supplier.active,
      createdAt: supplier.createdAt.toISOString(),
    };
  }

  async updateSupplier(principal: Principal, id: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์จัดการข้อมูลผู้จำหน่าย');
    }

    const input = parse(updateSupplierSchema, body);

    const existing = await this.db.supplier.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!existing) throw new NotFoundException('ไม่พบข้อมูลผู้จำหน่าย');

    const updated = await this.db.supplier.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'SUPPLIER_UPDATED',
        entityId: updated.id,
        newValue: { name: updated.name, active: updated.active },
        oldValue: { name: existing.name, active: existing.active },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      contactName: updated.contactName,
      phone: updated.phone,
      email: updated.email,
      address: updated.address,
      creditDays: updated.creditDays,
      active: updated.active,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // PURCHASE ORDERS
  // ---------------------------------------------------------------------------

  async listPurchaseOrders(
    principal: Principal,
    query: { branchId?: string; status?: PurchaseOrderStatus; supplierId?: string },
  ) {
    if (query.branchId) {
      requireBranch(principal, query.branchId);
    }

    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId: principal.tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    };

    const orders = await this.db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { user: { select: { displayName: true } } } },
        receivedBy: { select: { user: { select: { displayName: true } } } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return orders.map(po => {
      const totalOrderedQty = po.items.reduce((acc, i) => acc + Number(i.orderedQuantity), 0);
      const totalReceivedQty = po.items.reduce((acc, i) => acc + Number(i.receivedQuantity), 0);

      return {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        branchId: po.branchId,
        branchName: po.branch.name,
        createdByName: po.createdBy.user.displayName,
        receivedByName: po.receivedBy?.user.displayName ?? null,
        totalAmount: Number(po.totalAmount),
        itemCount: po.items.length,
        totalOrderedQty,
        totalReceivedQty,
        note: po.note,
        orderedAt: po.orderedAt?.toISOString() ?? null,
        receivedAt: po.receivedAt?.toISOString() ?? null,
        cancelledAt: po.cancelledAt?.toISOString() ?? null,
        createdAt: po.createdAt.toISOString(),
      };
    });
  }

  async getPurchaseOrder(principal: Principal, id: string) {
    const po = await this.db.purchaseOrder.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        supplier: true,
        branch: true,
        createdBy: { select: { user: { select: { displayName: true } } } },
        receivedBy: { select: { user: { select: { displayName: true } } } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
          },
        },
      },
    });

    if (!po) throw new NotFoundException('ไม่พบใบสั่งซื้อ');
    requireBranch(principal, po.branchId);

    return {
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      supplier: {
        id: po.supplier.id,
        name: po.supplier.name,
        contactName: po.supplier.contactName,
        phone: po.supplier.phone,
        creditDays: po.supplier.creditDays,
      },
      branch: {
        id: po.branch.id,
        name: po.branch.name,
      },
      createdByName: po.createdBy.user.displayName,
      receivedByName: po.receivedBy?.user.displayName ?? null,
      totalAmount: Number(po.totalAmount),
      note: po.note,
      orderedAt: po.orderedAt?.toISOString() ?? null,
      receivedAt: po.receivedAt?.toISOString() ?? null,
      cancelledAt: po.cancelledAt?.toISOString() ?? null,
      createdAt: po.createdAt.toISOString(),
      items: po.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        orderedQuantity: Number(item.orderedQuantity),
        receivedQuantity: Number(item.receivedQuantity),
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
      })),
    };
  }

  async createPurchaseOrder(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์สร้างใบสั่งซื้อ');
    }

    const input = parse(createPurchaseOrderSchema, body);
    requireBranch(principal, input.branchId);

    const supplier = await this.db.supplier.findFirst({
      where: { id: input.supplierId, tenantId: principal.tenantId },
    });
    if (!supplier) throw new NotFoundException('ไม่พบข้อมูลผู้จำหน่าย');
    if (!supplier.active) throw new ConflictException('ผู้จำหน่ายนี้ถูกระงับการใช้งาน');

    const branch = await this.db.branch.findFirst({
      where: { id: input.branchId, tenantId: principal.tenantId },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    return this.db.$transaction(async tx => {
      const poNumber = generatePoNumber();
      let totalAmount = new Prisma.Decimal(0);

      // Verify all products
      const itemsData: {
        productId: string;
        orderedQuantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
      }[] = [];

      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId: principal.tenantId },
        });
        if (!product) throw new NotFoundException(`ไม่พบสินค้ารหัส ${item.productId}`);
        if (!product.active) throw new ConflictException(`สินค้า "${product.name}" ปิดการใช้งานอยู่`);

        const orderedQty = new Prisma.Decimal(item.orderedQuantity);
        const unitCost = new Prisma.Decimal(item.unitCost);
        const lineTotal = orderedQty.mul(unitCost);

        totalAmount = totalAmount.add(lineTotal);
        itemsData.push({
          productId: item.productId,
          orderedQuantity: orderedQty,
          unitCost,
          totalCost: lineTotal,
        });
      }

      const po = await tx.purchaseOrder.create({
        data: {
          tenantId: principal.tenantId,
          poNumber,
          supplierId: input.supplierId,
          branchId: input.branchId,
          createdById: principal.membershipId,
          status: 'ORDERED', // Automatically in ordered status so it's ready for goods receipt
          totalAmount,
          note: input.note || null,
          orderedAt: new Date(),
          items: {
            create: itemsData.map(i => ({
              productId: i.productId,
              orderedQuantity: i.orderedQuantity,
              receivedQuantity: new Prisma.Decimal(0),
              unitCost: i.unitCost,
              totalCost: i.totalCost,
            })),
          },
        },
        include: {
          supplier: true,
          branch: true,
          items: {
            include: { product: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'PURCHASE_ORDER_CREATED',
          entityId: po.id,
          newValue: {
            poNumber,
            supplier: supplier.name,
            totalAmount: totalAmount.toString(),
            itemCount: itemsData.length,
          },
        },
      });

      return {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        supplierName: po.supplier.name,
        branchName: po.branch.name,
        totalAmount: Number(po.totalAmount),
        note: po.note,
        createdAt: po.createdAt.toISOString(),
      };
    });
  }

  async receiveGoods(principal: Principal, poId: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์ตรวจรับสินค้าเข้าสต็อก');
    }

    const input = parse(receiveGoodsSchema, body);

    return this.db.$transaction(async tx => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: poId, tenantId: principal.tenantId },
        include: {
          supplier: true,
          branch: true,
          items: { include: { product: true } },
        },
      });

      if (!po) throw new NotFoundException('ไม่พบใบสั่งซื้อ');
      requireBranch(principal, po.branchId);

      if (po.status !== 'ORDERED' && po.status !== 'PARTIALLY_RECEIVED') {
        throw new ConflictException(
          `ไม่สามารถตรวจรับสินค้าสำหรับใบสั่งซื้อที่มีสถานะ "${po.status}" ได้`,
        );
      }

      for (const receiveItem of input.items) {
        const poItem = po.items.find(i => i.id === receiveItem.purchaseOrderItemId);
        if (!poItem) {
          throw new NotFoundException(`ไม่พบรายการสินค้าใน PO รหัส ${receiveItem.purchaseOrderItemId}`);
        }

        const receiveQty = new Prisma.Decimal(receiveItem.receiveQuantity);
        const remainingToReceive = poItem.orderedQuantity.minus(poItem.receivedQuantity);

        if (receiveQty.greaterThan(remainingToReceive)) {
          throw new ConflictException(
            `จำนวนที่รับของสินค้า "${poItem.product.name}" เกินจำนวนที่สั่ง (สั่งคงเหลือ ${remainingToReceive} ชิ้น แต่ต้องการรับ ${receiveQty} ชิ้น)`,
          );
        }

        const newReceivedQty = poItem.receivedQuantity.plus(receiveQty);

        // Update PO Item
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: newReceivedQty },
        });

        // Update branch inventory
        const invKey = {
          tenantId: principal.tenantId,
          branchId: po.branchId,
          productId: poItem.productId,
        };

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: { tenantId_branchId_productId: invKey },
        });

        const currentQty = currentBalance?.quantity ?? new Prisma.Decimal(0);
        const newQty = currentQty.add(receiveQty);

        await tx.inventoryBalance.upsert({
          where: { tenantId_branchId_productId: invKey },
          create: { ...invKey, quantity: newQty },
          update: { quantity: newQty },
        });

        // Record stock movement (RECEIVE)
        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: po.branchId,
            productId: poItem.productId,
            actorMembershipId: principal.membershipId,
            type: 'RECEIVE',
            quantity: receiveQty,
            balanceBefore: currentQty,
            balanceAfter: newQty,
            note: `ตรวจรับสินค้าจาก ${po.supplier.name} (${po.poNumber})`,
            requestId: randomUUID(),
          },
        });
      }

      // Refresh items to calculate new overall status
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });

      const allCompleted = updatedItems.every(i =>
        i.receivedQuantity.greaterThanOrEqualTo(i.orderedQuantity),
      );

      const newStatus: PurchaseOrderStatus = allCompleted ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      const updatedPo = await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: newStatus,
          receivedAt: allCompleted ? new Date() : po.receivedAt ?? new Date(),
          receivedById: principal.membershipId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'PURCHASE_ORDER_RECEIVED',
          entityId: po.id,
          newValue: {
            status: newStatus,
            receivedItemsCount: input.items.length,
          },
        },
      });

      return {
        id: updatedPo.id,
        poNumber: updatedPo.poNumber,
        status: updatedPo.status,
        receivedAt: updatedPo.receivedAt?.toISOString() ?? null,
      };
    });
  }

  async cancelPurchaseOrder(principal: Principal, poId: string) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์ยกเลิกใบสั่งซื้อ');
    }

    const po = await this.db.purchaseOrder.findFirst({
      where: { id: poId, tenantId: principal.tenantId },
      include: { items: true },
    });

    if (!po) throw new NotFoundException('ไม่พบใบสั่งซื้อ');
    requireBranch(principal, po.branchId);

    if (po.status === 'CANCELLED') {
      throw new ConflictException('ใบสั่งซื้อนี้ถูกยกเลิกไปแล้ว');
    }

    if (po.status === 'RECEIVED') {
      throw new ConflictException('ไม่สามารถยกเลิกใบสั่งซื้อที่ตรวจรับสินค้าเข้าสต็อกแล้วได้');
    }

    const hasReceivedAny = po.items.some(i => Number(i.receivedQuantity) > 0);
    if (hasReceivedAny) {
      throw new ConflictException('ไม่สามารถยกเลิกใบสั่งซื้อที่มีการรับสินค้าเข้าสต็อกไปแล้วบางส่วนได้');
    }

    const updated = await this.db.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'PURCHASE_ORDER_CANCELLED',
        entityId: po.id,
        newValue: { poNumber: po.poNumber },
      },
    });

    return {
      id: updated.id,
      poNumber: updated.poNumber,
      status: updated.status,
      cancelledAt: updated.cancelledAt?.toISOString() ?? null,
    };
  }
}
