import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Principal, requireOwner } from './auth';
import { Database } from './database';
import {
  createPositionSchema,
  parse,
  updatePositionPermissionsSchema,
  updatePositionSchema,
  updateStaffPositionSchema,
} from './validation';

@Injectable()
export class PositionService {
  constructor(@Inject(Database) private readonly db: Database) {}

  /**
   * List all positions for the current tenant with member and permission counts
   */
  async listPositions(principal: Principal) {
    return this.db.position.findMany({
      where: { tenantId: principal.tenantId },
      include: {
        _count: {
          select: {
            memberships: true,
            permissions: { where: { canView: true } },
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Create a new custom position for tenant
   */
  async createPosition(principal: Principal, body: unknown) {
    requireOwner(principal);
    const input = parse(createPositionSchema, body);

    const existing = await this.db.position.findFirst({
      where: { tenantId: principal.tenantId, code: input.code },
    });
    if (existing) {
      throw new ConflictException(`มีรหัสตำแหน่ง "${input.code}" อยู่แล้วในร้านค้า`);
    }

    const position = await this.db.$transaction(async tx => {
      const pos = await tx.position.create({
        data: {
          tenantId: principal.tenantId,
          code: input.code,
          name: input.name,
          description: input.description,
          isSystem: false,
          active: true,
        },
      });

      // Seed all navigation menus with canView = false by default
      const menus = await tx.navigationMenu.findMany({ select: { id: true } });
      if (menus.length > 0) {
        await tx.positionMenuPermission.createMany({
          data: menus.map(m => ({
            positionId: pos.id,
            menuId: m.id,
            canView: false,
            canExport: false,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'POSITION_CREATED',
          entityId: pos.id,
          newValue: { code: pos.code, name: pos.name },
        },
      });

      return pos;
    });

    return position;
  }

  /**
   * Update position details (name, description, active)
   */
  async updatePosition(principal: Principal, positionId: string, body: unknown) {
    requireOwner(principal);
    const input = parse(updatePositionSchema, body);

    const pos = await this.db.position.findFirst({
      where: { id: positionId, tenantId: principal.tenantId },
    });
    if (!pos) {
      throw new NotFoundException('ไม่พบข้อมูลตำแหน่งงาน');
    }

    if (pos.isSystem && pos.code === 'OWNER' && input.active === false) {
      throw new BadRequestException('ไม่สามารถปิดใช้งานตำแหน่งเจ้าของร้านได้');
    }

    const updated = await this.db.$transaction(async tx => {
      const res = await tx.position.update({
        where: { id: positionId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'POSITION_UPDATED',
          entityId: positionId,
          oldValue: { name: pos.name, active: pos.active },
          newValue: { name: res.name, active: res.active },
        },
      });

      return res;
    });

    return updated;
  }

  /**
   * Get full Permission Matrix: positions, navigation menus, and current permissions
   */
  async getPermissionMatrix(principal: Principal) {
    const [positions, menus, permissions] = await Promise.all([
      this.db.position.findMany({
        where: { tenantId: principal.tenantId, active: true },
        select: { id: true, code: true, name: true, isSystem: true },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      }),
      this.db.navigationMenu.findMany({
        where: { active: true },
        select: { id: true, key: true, section: true, sectionLabel: true, label: true, icon: true, sortOrder: true },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.db.positionMenuPermission.findMany({
        where: {
          position: { tenantId: principal.tenantId },
        },
      }),
    ]);

    // Map: matrix[positionId][menuId] = { canView, canExport }
    const matrix: Record<string, Record<string, { canView: boolean; canExport: boolean }>> = {};
    for (const p of positions) {
      matrix[p.id] = {};
      for (const m of menus) {
        matrix[p.id][m.id] = { canView: false, canExport: false };
      }
    }

    for (const perm of permissions) {
      if (matrix[perm.positionId] && matrix[perm.positionId][perm.menuId]) {
        matrix[perm.positionId][perm.menuId] = {
          canView: perm.canView,
          canExport: perm.canExport,
        };
      }
    }

    return {
      positions,
      menus,
      matrix,
    };
  }

  /**
   * Update permissions for a specific position
   */
  async updatePositionPermissions(principal: Principal, positionId: string, body: unknown) {
    requireOwner(principal);
    const input = parse(updatePositionPermissionsSchema, body);

    const pos = await this.db.position.findFirst({
      where: { id: positionId, tenantId: principal.tenantId },
    });
    if (!pos) {
      throw new NotFoundException('ไม่พบข้อมูลตำแหน่งงาน');
    }

    await this.db.$transaction(async tx => {
      for (const perm of input.permissions) {
        await tx.positionMenuPermission.upsert({
          where: {
            positionId_menuId: {
              positionId,
              menuId: perm.menuId,
            },
          },
          update: {
            canView: perm.canView,
            ...(perm.canExport !== undefined ? { canExport: perm.canExport } : {}),
          },
          create: {
            positionId,
            menuId: perm.menuId,
            canView: perm.canView,
            canExport: perm.canExport ?? false,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'POSITION_PERMISSIONS_UPDATED',
          entityId: positionId,
          newValue: {
            positionCode: pos.code,
            positionName: pos.name,
            updatedCount: input.permissions.length,
          },
        },
      });
    });

    return { ok: true, count: input.permissions.length };
  }

  /**
   * Assign or update staff's position
   */
  async updateStaffPosition(principal: Principal, membershipId: string, body: unknown) {
    requireOwner(principal);
    const input = parse(updateStaffPositionSchema, body);

    const member = await this.db.membership.findFirst({
      where: { id: membershipId, tenantId: principal.tenantId },
      include: { position: true },
    });
    if (!member) {
      throw new NotFoundException('ไม่พบข้อมูลพนักงาน');
    }

    if (input.positionId) {
      const pos = await this.db.position.findFirst({
        where: { id: input.positionId, tenantId: principal.tenantId },
      });
      if (!pos) {
        throw new NotFoundException('ไม่พบตำแหน่งงานที่ระบุ');
      }
    }

    const updated = await this.db.membership.update({
      where: { id: membershipId },
      data: { positionId: input.positionId },
      include: { position: true, user: { select: { id: true, email: true, displayName: true } } },
    });

    return updated;
  }
}

export { STANDARD_POSITIONS_DEF, seedDefaultPositionsForTenant } from './auth';

