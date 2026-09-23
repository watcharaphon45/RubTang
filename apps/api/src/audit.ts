import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from './auth';

export interface AuditQueryFilter {
  action?: string;
  category?: string;
  actorUserId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  cursor?: string;
}

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
  ADMIN: ['TENANT_CREATED', 'BRANCH_CREATED', 'STAFF_INVITED', 'LINE_SETTINGS_UPDATED'],
};

export const ACTION_METADATA: Record<
  string,
  { label: string; category: string; severity: 'INFO' | 'WARNING' | 'CRITICAL' }
> = {
  TENANT_CREATED: { label: 'สร้างร้านค้าใหม่', category: 'ADMIN', severity: 'INFO' },
  BRANCH_CREATED: { label: 'เพิ่มสาขาใหม่', category: 'ADMIN', severity: 'INFO' },
  STAFF_INVITED: { label: 'เพิ่ม/เชิญพนักงาน', category: 'ADMIN', severity: 'WARNING' },
  LINE_SETTINGS_UPDATED: { label: 'แก้ไขการตั้งค่า LINE OA', category: 'ADMIN', severity: 'INFO' },
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

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  private requireManagerOrOwner(principal: Principal) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงประวัติการตรวจสอบ (Audit Log)');
    }
  }

  async list(principal: Principal, query: AuditQueryFilter) {
    this.requireManagerOrOwner(principal);

    const where: Prisma.AuditLogWhereInput = {
      tenantId: principal.tenantId,
    };

    // Filter by specific action or category
    if (query.action && query.action !== 'ทั้งหมด') {
      where.action = query.action;
    } else if (query.category && query.category !== 'ทั้งหมด') {
      const actionsInCategory = ACTION_CATEGORIES[query.category];
      if (actionsInCategory && actionsInCategory.length > 0) {
        where.action = { in: actionsInCategory };
      }
    }

    // Filter by actor user
    if (query.actorUserId && query.actorUserId !== 'ทั้งหมด') {
      where.actorUserId = query.actorUserId;
    }

    // Date range filter
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    // Search query
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { actor: { displayName: { contains: term, mode: 'insensitive' } } },
        { actor: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(query.limit || 50, 100);

    const [items, totalCount] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: limit,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const formattedItems = items.map((item) => {
      const meta = ACTION_METADATA[item.action] || {
        label: item.action,
        category: 'OTHER',
        severity: 'INFO',
      };

      return {
        id: item.id,
        action: item.action,
        actionLabel: meta.label,
        category: meta.category,
        severity: meta.severity,
        entityId: item.entityId,
        actor: {
          id: item.actor.id,
          name: item.actor.displayName,
          email: item.actor.email,
        },
        oldValue: item.oldValue,
        newValue: item.newValue,
        createdAt: item.createdAt.toISOString(),
      };
    });

    const nextCursor = items.length === limit ? items[items.length - 1].id : null;

    return {
      items: formattedItems,
      totalCount,
      nextCursor,
    };
  }

  async getById(principal: Principal, id: string) {
    this.requireManagerOrOwner(principal);

    const item = await this.prisma.auditLog.findFirst({
      where: {
        id,
        tenantId: principal.tenantId,
      },
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('ไม่พบรายการประวัติการเปลี่ยนแปลง');
    }

    const meta = ACTION_METADATA[item.action] || {
      label: item.action,
      category: 'OTHER',
      severity: 'INFO',
    };

    return {
      id: item.id,
      action: item.action,
      actionLabel: meta.label,
      category: meta.category,
      severity: meta.severity,
      entityId: item.entityId,
      actor: {
        id: item.actor.id,
        name: item.actor.displayName,
        email: item.actor.email,
      },
      oldValue: item.oldValue,
      newValue: item.newValue,
      createdAt: item.createdAt.toISOString(),
    };
  }

  async getMetrics(principal: Principal) {
    this.requireManagerOrOwner(principal);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayCount, weekCount, criticalCount, actors] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          tenantId: principal.tenantId,
          createdAt: { gte: startOfToday },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId: principal.tenantId,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId: principal.tenantId,
          action: { in: ['SALE_VOIDED', 'TRANSFER_CANCELLED', 'STOCK_TAKE_CANCELLED'] },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['actorUserId'],
        where: { tenantId: principal.tenantId },
        _count: { actorUserId: true },
        orderBy: { _count: { actorUserId: 'desc' } },
        take: 3,
      }),
    ]);

    // Fetch actor details for top users
    const actorUserIds = actors.map((a) => a.actorUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorUserIds } },
      select: { id: true, displayName: true, email: true },
    });

    const topActors = actors.map((a) => {
      const u = users.find((user) => user.id === a.actorUserId);
      return {
        userId: a.actorUserId,
        displayName: u?.displayName || 'Unknown',
        email: u?.email || '',
        activityCount: a._count.actorUserId,
      };
    });

    return {
      todayCount,
      weekCount,
      criticalCount,
      topActors,
    };
  }

  async getActions(principal: Principal) {
    this.requireManagerOrOwner(principal);

    const groups = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { tenantId: principal.tenantId },
      _count: { action: true },
    });

    return groups.map((g) => ({
      action: g.action,
      count: g._count.action,
      label: ACTION_METADATA[g.action]?.label || g.action,
      category: ACTION_METADATA[g.action]?.category || 'OTHER',
      severity: ACTION_METADATA[g.action]?.severity || 'INFO',
    }));
  }
}
