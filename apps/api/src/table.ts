import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Database } from './database';
import { Principal } from './auth';
import { randomBytes } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { Product } from '@prisma/client';

export interface CreateTableDto {
  branchId: string;
  number: string;
  name: string;
  zone?: string;
  capacity?: number;
}

export interface UpdateTableDto {
  number?: string;
  name?: string;
  zone?: string;
  capacity?: number;
  active?: boolean;
}

export interface OpenTableSessionDto {
  guestCount?: number;
  note?: string;
}

export interface SubmitOrderDto {
  items: Array<{
    productId: string;
    quantity: number;
    note?: string;
  }>;
  note?: string;
}

@Injectable()
export class TableService {
  constructor(@Inject(Database) private readonly db: Database) {}

  // ─── Table Management (Authenticated) ─────────────────────────────────────

  async listTables(principal: Principal, branchId?: string) {
    const targetBranchId = branchId || principal.branchIds[0];
    if (!targetBranchId) {
      throw new BadRequestException('ต้องระบุสาขา (branchId)');
    }
    if (principal.role !== 'OWNER' && !principal.branchIds.includes(targetBranchId)) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงสาขานี้');
    }

    const tables = await this.db.diningTable.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: targetBranchId,
        active: true,
      },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: {
            orders: {
              include: {
                items: true,
              },
            },
          },
          take: 1,
        },
      },
      orderBy: [
        { zone: 'asc' },
        { number: 'asc' },
      ],
    });

    return tables.map((t: any) => {
      const activeSession = t.sessions[0] ?? null;
      let totalAmount = 0;
      let totalItems = 0;
      let pendingOrdersCount = 0;

      if (activeSession) {
        for (const order of activeSession.orders) {
          if (order.status === 'PENDING') pendingOrdersCount++;
          if (order.status !== 'CANCELLED') {
            for (const item of order.items) {
              totalItems += Number(item.quantity);
              totalAmount += Number(item.subtotal);
            }
          }
        }
      }

      return {
        id: t.id,
        number: t.number,
        name: t.name,
        zone: t.zone,
        capacity: t.capacity,
        status: activeSession ? 'OCCUPIED' : t.status,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              sessionToken: activeSession.sessionToken,
              openedAt: activeSession.openedAt,
              guestCount: activeSession.guestCount,
              note: activeSession.note,
              totalAmount,
              totalItems,
              pendingOrdersCount,
              ordersCount: activeSession.orders.length,
            }
          : null,
      };
    });
  }

  async createTable(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถเพิ่มโต๊ะได้');
    }
    const b = body as CreateTableDto;
    if (!b?.branchId || !b?.number || !b?.name) {
      throw new BadRequestException('กรุณาระบุสาขา เลขโต๊ะ และชื่อโต๊ะ');
    }

    const existing = await this.db.diningTable.findUnique({
      where: {
        tenantId_branchId_number: {
          tenantId: principal.tenantId,
          branchId: b.branchId,
          number: b.number.trim(),
        },
      },
    });

    if (existing) {
      if (!existing.active) {
        // Re-activate if was deactivated
        return this.db.diningTable.update({
          where: { id: existing.id },
          data: {
            name: b.name.trim(),
            zone: b.zone?.trim() || 'General',
            capacity: Number(b.capacity) || 4,
            active: true,
          },
        });
      }
      throw new BadRequestException(`โต๊ะหมายเลข "${b.number}" มีอยู่ในระบบแล้ว`);
    }

    return this.db.diningTable.create({
      data: {
        tenantId: principal.tenantId,
        branchId: b.branchId,
        number: b.number.trim(),
        name: b.name.trim(),
        zone: b.zone?.trim() || 'General',
        capacity: Number(b.capacity) || 4,
      },
    });
  }

  async updateTable(principal: Principal, id: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถแก้ไขโต๊ะได้');
    }
    const b = body as UpdateTableDto;
    const table = await this.db.diningTable.findUnique({
      where: { id },
    });
    if (!table || table.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบข้อมูลโต๊ะ');
    }

    return this.db.diningTable.update({
      where: { id },
      data: {
        ...(b.name ? { name: b.name.trim() } : {}),
        ...(b.number ? { number: b.number.trim() } : {}),
        ...(b.zone ? { zone: b.zone.trim() } : {}),
        ...(b.capacity ? { capacity: Number(b.capacity) } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
    });
  }

  // ─── Table Session & Dynamic QR ───────────────────────────────────────────

  async openSession(principal: Principal, tableId: string, body: unknown) {
    const b = (body || {}) as OpenTableSessionDto;
    const table = await this.db.diningTable.findUnique({
      where: { id: tableId },
      include: {
        branch: {
          select: { id: true, name: true, tenant: { select: { name: true } } },
        },
      },
    });
    if (!table || table.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบข้อมูลโต๊ะ');
    }

    // Check if table already has an OPEN session
    const existingSession = await this.db.tableSession.findFirst({
      where: {
        tableId,
        status: 'OPEN',
      },
    });

    if (existingSession) {
      // Return existing session
      return {
        session: existingSession,
        table,
        orderUrl: `/order?token=${existingSession.sessionToken}`,
      };
    }

    // Generate secure dynamic session token
    const token = randomBytes(24).toString('hex');

    const session = await this.db.tableSession.create({
      data: {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        tableId: table.id,
        sessionToken: token,
        status: 'OPEN',
        guestCount: Number(b.guestCount) || 1,
        note: b.note?.trim() || null,
      },
    });

    await this.db.diningTable.update({
      where: { id: tableId },
      data: { status: 'OCCUPIED' },
    });

    return {
      session,
      table,
      orderUrl: `/order?token=${token}`,
    };
  }

  async closeSession(principal: Principal, sessionId: string, saleId?: string) {
    const session = await this.db.tableSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบรอบการใช้งานโต๊ะนี้');
    }

    const updated = await this.db.tableSession.update({
      where: { id: sessionId },
      data: {
        status: saleId ? 'CLOSED' : 'CANCELLED',
        closedAt: new Date(),
        ...(saleId ? { saleId } : {}),
      },
    });

    // Check if table has other open sessions, if not set back to AVAILABLE
    const otherOpen = await this.db.tableSession.count({
      where: { tableId: session.tableId, status: 'OPEN' },
    });
    if (otherOpen === 0) {
      await this.db.diningTable.update({
        where: { id: session.tableId },
        data: { status: 'AVAILABLE' },
      });
    }

    return updated;
  }

  async getSessionDetails(principal: Principal, sessionId: string) {
    const session = await this.db.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        orders: {
          include: {
            items: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session || session.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบข้อมูลรอบโต๊ะ');
    }

    let subtotal = 0;
    const aggregatedItems: Record<string, {
      productId: string;
      name: string;
      sku: string;
      price: number;
      quantity: number;
      subtotal: number;
    }> = {};

    for (const order of session.orders) {
      if (order.status !== 'CANCELLED') {
        for (const item of order.items) {
          const qty = Number(item.quantity);
          const price = Number(item.price);
          const itemSubtotal = Number(item.subtotal);
          subtotal += itemSubtotal;

          if (!aggregatedItems[item.productId]) {
            aggregatedItems[item.productId] = {
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              price,
              quantity: qty,
              subtotal: itemSubtotal,
            };
          } else {
            aggregatedItems[item.productId].quantity += qty;
            aggregatedItems[item.productId].subtotal += itemSubtotal;
          }
        }
      }
    }

    return {
      session,
      table: session.table,
      orders: session.orders,
      aggregatedItems: Object.values(aggregatedItems),
      subtotal,
    };
  }

  async updateOrderStatus(principal: Principal, orderId: string, status: 'PENDING' | 'COOKING' | 'SERVED' | 'CANCELLED') {
    const order = await this.db.tableOrder.findUnique({
      where: { id: orderId },
      include: { session: true },
    });
    if (!order || order.session.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบออเดอร์');
    }

    return this.db.tableOrder.update({
      where: { id: orderId },
      data: { status },
    });
  }

  // ─── Public Customer Ordering (Unauthenticated / Token Based) ──────────────

  async getPublicSession(token: string) {
    if (!token) throw new BadRequestException('Token ไม่ถูกต้อง');

    const session = await this.db.tableSession.findUnique({
      where: { sessionToken: token },
      include: {
        tenant: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, phone: true } },
        table: { select: { id: true, number: true, name: true, zone: true } },
        orders: {
          include: {
            items: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('ไม่พบโต๊ะอาหาร หรือ QR Code ไม่ถูกต้อง');
    }

    if (session.status !== 'OPEN') {
      return {
        expired: true,
        message: 'รอบโต๊ะนี้ได้ถูกปิดหรือเช็คบิลเรียบร้อยแล้ว กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะใหม่',
        table: session.table,
        branch: session.branch,
        tenant: session.tenant,
      };
    }

    // Fetch active products available for this branch
    const products = await this.db.product.findMany({
      where: {
        tenantId: session.tenantId,
        active: true,
      },
      include: {
        inventory: {
          where: { branchId: session.branchId },
          select: { quantity: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const menu = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      price: Number(p.price),
      inStock: p.inventory.length > 0 ? Number(p.inventory[0].quantity) > 0 : true,
      stockQuantity: p.inventory.length > 0 ? Number(p.inventory[0].quantity) : 0,
    }));

    // Calculate current running total
    let runningTotal = 0;
    let itemCount = 0;
    for (const order of session.orders) {
      if (order.status !== 'CANCELLED') {
        for (const item of order.items) {
          runningTotal += Number(item.subtotal);
          itemCount += Number(item.quantity);
        }
      }
    }

    return {
      expired: false,
      session: {
        id: session.id,
        sessionToken: session.sessionToken,
        openedAt: session.openedAt,
        guestCount: session.guestCount,
      },
      table: session.table,
      branch: session.branch,
      tenant: session.tenant,
      menu,
      orders: session.orders,
      runningTotal,
      itemCount,
    };
  }

  async submitPublicOrder(token: string, body: unknown) {
    if (!token) throw new BadRequestException('Token ไม่ถูกต้อง');
    const b = body as SubmitOrderDto;
    if (!b?.items || !Array.isArray(b.items) || b.items.length === 0) {
      throw new BadRequestException('กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการ');
    }

    const session = await this.db.tableSession.findUnique({
      where: { sessionToken: token },
      include: { table: true },
    });

    if (!session || session.status !== 'OPEN') {
      throw new BadRequestException('รอบโต๊ะนี้หมดอายุหรือปิดไปแล้ว ไม่สามารถสั่งอาหารได้');
    }

    // Fetch products to verify price and stock
    const productIds = b.items.map(i => i.productId);
    const products = await this.db.product.findMany({
      where: {
        id: { in: productIds },
        tenantId: session.tenantId,
        active: true,
      },
    });

    const productMap = new Map<string, Product>(products.map((p: Product) => [p.id, p]));

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    // Build items with validated prices
    const orderItemsData = b.items.map(i => {
      const p = productMap.get(i.productId);
      if (!p) {
        throw new BadRequestException(`ไม่พบรายการสินค้ารหัส ${i.productId}`);
      }
      const qty = Math.max(1, Math.floor(Number(i.quantity) || 1));
      const price = Number(p.price);
      const subtotal = price * qty;

      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        price: new Decimal(price),
        quantity: new Decimal(qty),
        subtotal: new Decimal(subtotal),
        note: i.note?.trim() || null,
      };
    });

    const newOrder = await this.db.tableOrder.create({
      data: {
        tableSessionId: session.id,
        orderNumber,
        status: 'PENDING',
        note: b.note?.trim() || null,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: true,
      },
    });

    return {
      success: true,
      order: newOrder,
      message: 'ส่งออเดอร์เข้าครัวเรียบร้อยแล้ว!',
    };
  }

  async getPublicOrderStatus(token: string) {
    if (!token) throw new BadRequestException('Token ไม่ถูกต้อง');

    const session = await this.db.tableSession.findUnique({
      where: { sessionToken: token },
      include: {
        table: true,
        orders: {
          include: {
            items: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('ไม่พบข้อมูลรอบโต๊ะ');
    }

    let runningTotal = 0;
    for (const order of session.orders) {
      if (order.status !== 'CANCELLED') {
        for (const item of order.items) {
          runningTotal += Number(item.subtotal);
        }
      }
    }

    return {
      status: session.status,
      table: session.table,
      orders: session.orders,
      runningTotal,
    };
  }
}
