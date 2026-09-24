import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PositionService } from '../src/position';
import { Principal } from '../src/auth';

describe('PositionService & RBAC Permissions Matrix', () => {
  const ownerPrincipal: Principal = {
    userId: 'user-owner-1',
    tenantId: 'tenant-1',
    membershipId: 'mem-1',
    role: 'OWNER',
    branchIds: ['branch-1'],
    positionId: 'pos-owner-1',
    positionCode: 'OWNER',
    positionName: 'เจ้าของร้าน / ผู้บริหาร',
  };

  const cashierPrincipal: Principal = {
    userId: 'user-cashier-1',
    tenantId: 'tenant-1',
    membershipId: 'mem-2',
    role: 'CASHIER',
    branchIds: ['branch-1'],
    positionId: 'pos-cashier-1',
    positionCode: 'CASHIER',
    positionName: 'พนักงานแคชเชียร์',
  };

  it('lists positions for tenant with member and permission count', async () => {
    const mockPositions = [
      {
        id: 'pos-1',
        tenantId: 'tenant-1',
        code: 'OWNER',
        name: 'เจ้าของร้าน / ผู้บริหาร',
        isSystem: true,
        active: true,
        _count: { memberships: 1, permissions: 17 },
      },
      {
        id: 'pos-2',
        tenantId: 'tenant-1',
        code: 'CASHIER',
        name: 'พนักงานแคชเชียร์',
        isSystem: true,
        active: true,
        _count: { memberships: 3, permissions: 5 },
      },
    ];

    const mockDb: any = {
      position: {
        findMany: vi.fn().mockResolvedValue(mockPositions),
      },
    };

    const service = new PositionService(mockDb);
    const result = await service.listPositions(ownerPrincipal);

    expect(result).toHaveLength(2);
    expect(result[0].code).toBe('OWNER');
    expect(mockDb.position.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      include: {
        _count: {
          select: { memberships: true, permissions: { where: { canView: true } } },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  });

  it('allows owner to create a custom position and seeds default permissions', async () => {
    const mockCreatedPos = {
      id: 'pos-custom-1',
      tenantId: 'tenant-1',
      code: 'BARISTA',
      name: 'บาริสต้าประจำร้าน',
      description: 'ทำหน้าที่ชงเครื่องดื่มและรับออเดอร์',
      isSystem: false,
      active: true,
    };

    const mockTx: any = {
      position: {
        create: vi.fn().mockResolvedValue(mockCreatedPos),
      },
      navigationMenu: {
        findMany: vi.fn().mockResolvedValue([{ id: 'menu-1' }, { id: 'menu-2' }]),
      },
      positionMenuPermission: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const mockDb: any = {
      position: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((fn: any) => fn(mockTx)),
    };

    const service = new PositionService(mockDb);
    const result = await service.createPosition(ownerPrincipal, {
      code: 'BARISTA',
      name: 'บาริสต้าประจำร้าน',
      description: 'ทำหน้าที่ชงเครื่องดื่มและรับออเดอร์',
    });

    expect(result.code).toBe('BARISTA');
    expect(mockTx.position.create).toHaveBeenCalled();
    expect(mockTx.positionMenuPermission.createMany).toHaveBeenCalledWith({
      data: [
        { positionId: 'pos-custom-1', menuId: 'menu-1', canView: false, canExport: false },
        { positionId: 'pos-custom-1', menuId: 'menu-2', canView: false, canExport: false },
      ],
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'POSITION_CREATED',
          tenantId: 'tenant-1',
        }),
      })
    );
  });

  it('rejects duplicate position code in same tenant', async () => {
    const mockDb: any = {
      position: {
        findFirst: vi.fn().mockResolvedValue({ id: 'pos-exist', code: 'CASHIER' }),
      },
    };

    const service = new PositionService(mockDb);
    await expect(
      service.createPosition(ownerPrincipal, {
        code: 'CASHIER',
        name: 'พนักงานแคชเชียร์ 2',
      })
    ).rejects.toThrow(ConflictException);
  });

  it('denies cashier from creating a position', async () => {
    const mockDb: any = {};
    const service = new PositionService(mockDb);
    await expect(
      service.createPosition(cashierPrincipal, {
        code: 'SUPERVISOR',
        name: 'หัวหน้างาน',
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it('builds full permission matrix with positions, menus, and mapping', async () => {
    const mockPositions = [
      { id: 'pos-1', code: 'OWNER', name: 'เจ้าของร้าน', isSystem: true },
      { id: 'pos-2', code: 'CASHIER', name: 'แคชเชียร์', isSystem: true },
    ];
    const mockMenus = [
      { id: 'm-pos', key: 'pos', section: 'SALES', sectionLabel: 'ขาย', label: 'หน้าขาย POS', icon: 'ShoppingCart', sortOrder: 10 },
      { id: 'm-rep', key: 'reports', section: 'MANAGEMENT', sectionLabel: 'จัดการ', label: 'รายงาน', icon: 'BarChart', sortOrder: 50 },
    ];
    const mockPerms = [
      { positionId: 'pos-1', menuId: 'm-pos', canView: true, canExport: true },
      { positionId: 'pos-1', menuId: 'm-rep', canView: true, canExport: true },
      { positionId: 'pos-2', menuId: 'm-pos', canView: true, canExport: false },
      { positionId: 'pos-2', menuId: 'm-rep', canView: false, canExport: false },
    ];

    const mockDb: any = {
      position: { findMany: vi.fn().mockResolvedValue(mockPositions) },
      navigationMenu: { findMany: vi.fn().mockResolvedValue(mockMenus) },
      positionMenuPermission: { findMany: vi.fn().mockResolvedValue(mockPerms) },
    };

    const service = new PositionService(mockDb);
    const result = await service.getPermissionMatrix(ownerPrincipal);

    expect(result.positions).toHaveLength(2);
    expect(result.menus).toHaveLength(2);
    expect(result.matrix['pos-1']['m-pos'].canView).toBe(true);
    expect(result.matrix['pos-1']['m-rep'].canView).toBe(true);
    expect(result.matrix['pos-2']['m-pos'].canView).toBe(true);
    expect(result.matrix['pos-2']['m-rep'].canView).toBe(false);
  });

  it('updates permissions for position and logs audit record', async () => {
    const mockTx: any = {
      positionMenuPermission: {
        upsert: vi.fn().mockResolvedValue({ id: 'perm-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const mockDb: any = {
      position: {
        findFirst: vi.fn().mockResolvedValue({ id: 'pos-2', code: 'CASHIER', name: 'แคชเชียร์' }),
      },
      $transaction: vi.fn((fn: any) => fn(mockTx)),
    };

    const service = new PositionService(mockDb);
    const result = await service.updatePositionPermissions(ownerPrincipal, 'pos-2', {
      permissions: [
        { menuId: 'm-pos', canView: true, canExport: false },
        { menuId: 'm-rep', canView: true, canExport: true },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(mockTx.positionMenuPermission.upsert).toHaveBeenCalledTimes(2);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'POSITION_PERMISSIONS_UPDATED',
          entityId: 'pos-2',
        }),
      })
    );
  });
});
