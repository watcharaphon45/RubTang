import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MenuService } from '../src/menu';
import { Principal } from '../src/auth';

describe('MenuService & RBAC Navigation', () => {
  const ownerPrincipal: Principal = {
    userId: 'user-owner-1',
    tenantId: 'tenant-1',
    membershipId: 'mem-1',
    role: 'OWNER',
    branchIds: ['branch-1'],
  };

  const cashierPrincipal: Principal = {
    userId: 'user-cashier-1',
    tenantId: 'tenant-1',
    membershipId: 'mem-2',
    role: 'CASHIER',
    branchIds: ['branch-1'],
  };

  const mockDbMenus = [
    {
      id: 'menu-1',
      key: 'dashboard',
      section: 'MAIN',
      sectionLabel: 'หน้าหลัก',
      label: 'ภาพรวม (Dashboard)',
      icon: 'BarChart3',
      sortOrder: 10,
      allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
      active: true,
    },
    {
      id: 'menu-2',
      key: 'branches_staff',
      section: 'MANAGEMENT',
      sectionLabel: 'จัดการร้าน',
      label: 'สาขาและพนักงาน',
      icon: 'Building2',
      sortOrder: 150,
      allowedRoles: ['OWNER'],
      active: true,
    },
    {
      id: 'menu-3',
      key: 'audit_log',
      section: 'MANAGEMENT',
      sectionLabel: 'จัดการร้าน',
      label: 'ประวัติการตรวจสอบ (Audit)',
      icon: 'History',
      sortOrder: 170,
      allowedRoles: ['OWNER', 'MANAGER'],
      active: true,
    },
  ];

  it('listUserMenus queries DB for active menus matching user role', async () => {
    const mockFindMany = vi.fn().mockResolvedValue(mockDbMenus);
    const service = new MenuService({
      navigationMenu: { findMany: mockFindMany },
    } as any);

    const result = await service.listUserMenus(cashierPrincipal);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        active: true,
        allowedRoles: { has: 'CASHIER' },
      },
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toEqual(mockDbMenus);
  });

  it('listAllMenus denies access for CASHIER role', async () => {
    const service = new MenuService({} as any);
    await expect(service.listAllMenus(cashierPrincipal)).rejects.toThrow(ForbiddenException);
  });

  it('listAllMenus returns all menus for OWNER', async () => {
    const mockFindMany = vi.fn().mockResolvedValue(mockDbMenus);
    const service = new MenuService({
      navigationMenu: { findMany: mockFindMany },
    } as any);

    const result = await service.listAllMenus(ownerPrincipal);
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toHaveLength(3);
  });

  it('updateMenu allows OWNER to update menu and writes audit log', async () => {
    const existing = mockDbMenus[0];
    const updated = { ...existing, label: 'ภาพรวมธุรกิจ', active: false };

    const mockFindUnique = vi.fn().mockResolvedValue(existing);
    const mockUpdate = vi.fn().mockResolvedValue(updated);
    const mockAuditCreate = vi.fn().mockResolvedValue({});

    const service = new MenuService({
      navigationMenu: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
      auditLog: {
        create: mockAuditCreate,
      },
    } as any);

    const res = await service.updateMenu(ownerPrincipal, 'menu-1', {
      label: 'ภาพรวมธุรกิจ',
      active: false,
    });

    expect(res.label).toBe('ภาพรวมธุรกิจ');
    expect(res.active).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'menu-1' },
      data: { label: 'ภาพรวมธุรกิจ', active: false },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'NAVIGATION_MENU_UPDATED',
          entityId: 'menu-1',
        }),
      })
    );
  });

  it('updateMenu rejects non-existent menu with NotFoundException', async () => {
    const service = new MenuService({
      navigationMenu: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any);

    await expect(
      service.updateMenu(ownerPrincipal, 'unknown-id', { label: 'ทดสอบ' })
    ).rejects.toThrow(NotFoundException);
  });
});
