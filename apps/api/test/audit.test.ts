import { describe, expect, it, vi } from 'vitest';
import { AuditService, ACTION_CATEGORIES, ACTION_METADATA } from '../src/audit';
import { Principal } from '../src/auth';

describe('AuditService', () => {
  const principalOwner: Principal = {
    userId: 'u-owner-1',
    email: 'owner@test.com',
    tenantId: 't-test-1',
    role: 'OWNER',
    branchIds: ['b1'],
  };

  const principalManager: Principal = {
    userId: 'u-manager-1',
    email: 'manager@test.com',
    tenantId: 't-test-1',
    role: 'MANAGER',
    branchIds: ['b1'],
  };

  const principalCashier: Principal = {
    userId: 'u-cashier-1',
    email: 'cashier@test.com',
    tenantId: 't-test-1',
    role: 'CASHIER',
    branchIds: ['b1'],
  };

  it('rejects cashier from accessing audit logs with 403 Forbidden', async () => {
    const mockPrisma = {} as any;
    const service = new AuditService(mockPrisma);

    await expect(service.list(principalCashier, {})).rejects.toThrow('ไม่มีสิทธิ์');
    await expect(service.getMetrics(principalCashier)).rejects.toThrow('ไม่มีสิทธิ์');
    await expect(service.getById(principalCashier, 'log-1')).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('allows owner to list audit logs with proper Thai labels and actor metadata', async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log-1',
            action: 'PRODUCT_UPDATED',
            entityId: 'prod-1',
            newValue: { price: '50.00' },
            oldValue: { price: '45.00' },
            createdAt: new Date('2026-09-23T10:00:00Z'),
            actor: {
              id: 'u-owner-1',
              displayName: 'เจ้าของร้าน',
              email: 'owner@test.com',
            },
          },
          {
            id: 'log-2',
            action: 'SALE_VOIDED',
            entityId: 'sale-99',
            newValue: { reason: 'คีย์ยอดผิด' },
            oldValue: null,
            createdAt: new Date('2026-09-23T09:30:00Z'),
            actor: {
              id: 'u-manager-1',
              displayName: 'ผู้จัดการ',
              email: 'manager@test.com',
            },
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    const result = await service.list(principalOwner, {});

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(2);

    const item1 = result.items[0];
    expect(item1.action).toBe('PRODUCT_UPDATED');
    expect(item1.actionLabel).toBe('แก้ไขข้อมูลสินค้า/ราคา');
    expect(item1.category).toBe('CATALOG');
    expect(item1.severity).toBe('INFO');
    expect(item1.actor.name).toBe('เจ้าของร้าน');

    const item2 = result.items[1];
    expect(item2.action).toBe('SALE_VOIDED');
    expect(item2.actionLabel).toBe('ยกเลิกบิลขาย (Void)');
    expect(item2.severity).toBe('CRITICAL');
    expect(item2.actor.name).toBe('ผู้จัดการ');
  });

  it('filters by category correctly mapping to actions', async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    await service.list(principalManager, { category: 'SALES' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't-test-1',
          action: { in: ACTION_CATEGORIES.SALES },
        }),
      })
    );
  });

  it('filters by search keyword across action, entityId, and actor', async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    await service.list(principalOwner, { search: 'อเมริกาโน่' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't-test-1',
          OR: expect.arrayContaining([
            { action: { contains: 'อเมริกาโน่', mode: 'insensitive' } },
            { entityId: { contains: 'อเมริกาโน่', mode: 'insensitive' } },
          ]),
        }),
      })
    );
  });

  it('retrieves audit log details by ID or throws NotFoundException', async () => {
    const mockPrisma = {
      auditLog: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'log-123',
            action: 'STOCK_MOVEMENT_CREATED',
            entityId: 'sm-1',
            newValue: { qty: 10 },
            oldValue: null,
            createdAt: new Date(),
            actor: { id: 'u1', displayName: 'สมชาย', email: 'somchai@test.com' },
          })
          .mockResolvedValueOnce(null),
      },
    } as any;

    const service = new AuditService(mockPrisma);

    const log = await service.getById(principalOwner, 'log-123');
    expect(log.action).toBe('STOCK_MOVEMENT_CREATED');
    expect(log.actionLabel).toBe('รับเข้า/ปรับยอดสต็อก');
    expect(log.actor.name).toBe('สมชาย');

    await expect(service.getById(principalOwner, 'unknown-id')).rejects.toThrow('ไม่พบ');
  });

  it('computes metrics including today count, week count, and top actors', async () => {
    const mockPrisma = {
      auditLog: {
        count: vi
          .fn()
          .mockResolvedValueOnce(12) // today
          .mockResolvedValueOnce(85) // week
          .mockResolvedValueOnce(3), // critical
        groupBy: vi.fn().mockResolvedValue([
          { actorUserId: 'u-owner-1', _count: { actorUserId: 50 } },
          { actorUserId: 'u-manager-1', _count: { actorUserId: 35 } },
        ]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'u-owner-1', displayName: 'เจ้าของร้าน', email: 'owner@test.com' },
          { id: 'u-manager-1', displayName: 'ผู้จัดการสาขา', email: 'mgr@test.com' },
        ]),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    const metrics = await service.getMetrics(principalOwner);

    expect(metrics.todayCount).toBe(12);
    expect(metrics.weekCount).toBe(85);
    expect(metrics.criticalCount).toBe(3);
    expect(metrics.topActors).toHaveLength(2);
    expect(metrics.topActors[0].displayName).toBe('เจ้าของร้าน');
    expect(metrics.topActors[0].activityCount).toBe(50);
  });

  it('loads action labels from database auditActionDefinition and respects overrides', async () => {
    const mockPrisma = {
      auditActionDefinition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'def-1',
            action: 'PRODUCT_UPDATED',
            label: 'แก้ไขข้อมูลสินค้าจาก DB',
            category: 'CATALOG_CUSTOM',
            severity: 'WARNING',
            description: 'Custom label test',
          },
        ]),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'log-1',
            action: 'PRODUCT_UPDATED',
            entityId: 'prod-1',
            newValue: { price: '60.00' },
            oldValue: { price: '50.00' },
            createdAt: new Date('2026-09-23T10:00:00Z'),
            actor: { id: 'u-owner-1', displayName: 'เจ้าของร้าน', email: 'owner@test.com' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    const result = await service.list(principalOwner, {});

    expect(result.items[0].actionLabel).toBe('แก้ไขข้อมูลสินค้าจาก DB');
    expect(result.items[0].category).toBe('CATALOG_CUSTOM');
    expect(result.items[0].severity).toBe('WARNING');
    expect(mockPrisma.auditActionDefinition.findMany).toHaveBeenCalled();
  });

  it('fetches all action definitions via getDefinitions', async () => {
    const mockPrisma = {
      auditActionDefinition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'def-1',
            action: 'SALE_COMPLETED',
            label: 'บันทึกการขายสำเร็จ',
            category: 'SALES',
            severity: 'INFO',
            description: 'คำอธิบายการขาย',
          },
        ]),
      },
    } as any;

    const service = new AuditService(mockPrisma);
    const definitions = await service.getDefinitions(principalOwner);

    expect(definitions).toHaveLength(1);
    expect(definitions[0].action).toBe('SALE_COMPLETED');
    expect(definitions[0].label).toBe('บันทึกการขายสำเร็จ');

    await expect(service.getDefinitions(principalCashier)).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('updates action definition, invalidates cache, and validates role', async () => {
    const mockPrisma = {
      auditActionDefinition: {
        upsert: vi.fn().mockResolvedValue({
          id: 'def-1',
          action: 'SALE_VOIDED',
          label: 'ยกเลิกรายการขายด่วน (Void)',
          category: 'SALES',
          severity: 'CRITICAL',
          description: 'ปรับเปลี่ยนคำอธิบาย',
        }),
      },
    } as any;

    const service = new AuditService(mockPrisma);

    await expect(
      service.updateDefinition(principalCashier, 'SALE_VOIDED', {
        label: 'ทดสอบ',
        category: 'SALES',
        severity: 'CRITICAL',
      })
    ).rejects.toThrow('ไม่มีสิทธิ์');

    const updated = await service.updateDefinition(principalManager, 'SALE_VOIDED', {
      label: 'ยกเลิกรายการขายด่วน (Void)',
      category: 'SALES',
      severity: 'CRITICAL',
      description: 'ปรับเปลี่ยนคำอธิบาย',
    });

    expect(updated.label).toBe('ยกเลิกรายการขายด่วน (Void)');
    expect(mockPrisma.auditActionDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'SALE_VOIDED' },
        create: expect.objectContaining({
          action: 'SALE_VOIDED',
          label: 'ยกเลิกรายการขายด่วน (Void)',
        }),
        update: expect.objectContaining({
          label: 'ยกเลิกรายการขายด่วน (Void)',
        }),
      })
    );
  });
});

