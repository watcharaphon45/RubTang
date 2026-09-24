import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Principal, requireOwner } from './auth';
import { Database } from './database';
import { parse, updateNavigationMenuSchema } from './validation';

@Injectable()
export class MenuService {
  constructor(@Inject(Database) private readonly db: Database) {}

  /**
   * Returns active menus permitted for the current user based on their Position (or fallback to Role)
   */
  async listUserMenus(principal: Principal) {
    if (principal.positionId) {
      const positionMenus = await this.db.navigationMenu.findMany({
        where: {
          active: true,
          permissions: {
            some: {
              positionId: principal.positionId,
              canView: true,
            },
          },
        },
        orderBy: {
          sortOrder: 'asc',
        },
      });

      if (positionMenus.length > 0) {
        return positionMenus;
      }
    }

    const menus = await this.db.navigationMenu.findMany({
      where: {
        active: true,
        allowedRoles: {
          has: principal.role,
        },
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return menus;
  }

  /**
   * Returns all system navigation menus for Master Data / Settings management
   */
  async listAllMenus(principal: Principal) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์จัดการเมนู');
    }

    const menus = await this.db.navigationMenu.findMany({
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return menus;
  }

  /**
   * Updates menu label, icon, sortOrder, active status, or allowed roles
   */
  async updateMenu(principal: Principal, menuId: string, body: unknown) {
    requireOwner(principal);
    const input = parse(updateNavigationMenuSchema, body);

    const existing = await this.db.navigationMenu.findUnique({
      where: { id: menuId },
    });

    if (!existing) {
      throw new NotFoundException('ไม่พบเมนูระบบที่ต้องการแก้ไข');
    }

    const updated = await this.db.navigationMenu.update({
      where: { id: menuId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.allowedRoles !== undefined ? { allowedRoles: input.allowedRoles } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'NAVIGATION_MENU_UPDATED',
        entityId: menuId,
        oldValue: {
          key: existing.key,
          label: existing.label,
          active: existing.active,
          allowedRoles: existing.allowedRoles,
          sortOrder: existing.sortOrder,
        },
        newValue: {
          key: updated.key,
          label: updated.label,
          active: updated.active,
          allowedRoles: updated.allowedRoles,
          sortOrder: updated.sortOrder,
        },
      },
    });

    return updated;
  }
}
