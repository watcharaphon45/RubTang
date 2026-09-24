import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { Principal } from './auth';
import { Database } from './database';
import { parse, updateAuditActionDefinitionSchema } from './validation';

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

export interface ActionMetadata {
  label: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description?: string | null;
}

export { ACTION_CATEGORIES, ACTION_METADATA } from './constants';
import { ACTION_CATEGORIES, ACTION_METADATA } from './constants';

@Injectable()
export class AuditService {
  private metadataCache: Map<string, ActionMetadata> | null = null;

  constructor(@Inject(Database) private readonly prisma: Database) {}

  private requireManagerOrOwner(principal: Principal) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงประวัติการตรวจสอบ (Audit Log)');
    }
  }

  async getActionMetadataMap(): Promise<Map<string, ActionMetadata>> {
    if (this.metadataCache) {
      return this.metadataCache;
    }

    const map = new Map<string, ActionMetadata>();
    for (const [action, meta] of Object.entries(ACTION_METADATA)) {
      map.set(action, { ...meta });
    }

    try {
      if (this.prisma.auditActionDefinition?.findMany) {
        const definitions = await this.prisma.auditActionDefinition.findMany();
        for (const def of definitions) {
          map.set(def.action, {
            label: def.label,
            category: def.category,
            severity: def.severity as 'INFO' | 'WARNING' | 'CRITICAL',
            description: def.description,
          });
        }
      }
    } catch {
      // In case table does not exist or Prisma model is not available
    }

    this.metadataCache = map;
    return map;
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
      const metadataMap = await this.getActionMetadataMap();
      const actionsInCategory: string[] = [];
      for (const [act, meta] of metadataMap.entries()) {
        if (meta.category === query.category) {
          actionsInCategory.push(act);
        }
      }
      const predefined = ACTION_CATEGORIES[query.category];
      if (
        predefined &&
        predefined.length > 0 &&
        actionsInCategory.length === predefined.length &&
        predefined.every((a) => actionsInCategory.includes(a))
      ) {
        where.action = { in: predefined };
      } else if (actionsInCategory.length > 0) {
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

    const [items, totalCount, metadataMap] = await Promise.all([
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
      this.getActionMetadataMap(),
    ]);

    const formattedItems = items.map((item) => {
      const meta = metadataMap.get(item.action) || {
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

    const [item, metadataMap] = await Promise.all([
      this.prisma.auditLog.findFirst({
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
      }),
      this.getActionMetadataMap(),
    ]);

    if (!item) {
      throw new NotFoundException('ไม่พบรายการประวัติการเปลี่ยนแปลง');
    }

    const meta = metadataMap.get(item.action) || {
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

    const [groups, metadataMap] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { tenantId: principal.tenantId },
        _count: { action: true },
      }),
      this.getActionMetadataMap(),
    ]);

    return groups.map((g) => {
      const meta = metadataMap.get(g.action);
      return {
        action: g.action,
        count: g._count.action,
        label: meta?.label || g.action,
        category: meta?.category || 'OTHER',
        severity: meta?.severity || 'INFO',
      };
    });
  }

  async getDefinitions(principal: Principal) {
    this.requireManagerOrOwner(principal);

    try {
      if (this.prisma.auditActionDefinition?.findMany) {
        const definitions = await this.prisma.auditActionDefinition.findMany({
          orderBy: [{ category: 'asc' }, { action: 'asc' }],
        });
        if (definitions && definitions.length > 0) {
          return definitions;
        }
      }
    } catch {
      // Fallback if table doesn't exist
    }

    return Object.entries(ACTION_METADATA).map(([action, meta]) => ({
      id: action,
      action,
      label: meta.label,
      category: meta.category,
      severity: meta.severity,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  async updateDefinition(principal: Principal, action: string, body: unknown) {
    this.requireManagerOrOwner(principal);
    const data = parse(updateAuditActionDefinitionSchema, body);

    const defaultMeta = ACTION_METADATA[action] || {
      label: action,
      category: 'OTHER',
      severity: 'INFO',
    };

    const updated = await this.prisma.auditActionDefinition.upsert({
      where: { action },
      create: {
        action,
        label: data.label,
        category: data.category,
        severity: data.severity,
        description: data.description ?? null,
      },
      update: {
        label: data.label,
        category: data.category,
        severity: data.severity,
        description: data.description !== undefined ? data.description : null,
      },
    });

    // Invalidate cache
    this.metadataCache = null;

    return updated;
  }
}
