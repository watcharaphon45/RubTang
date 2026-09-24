import { describe, expect, it, vi } from 'vitest';
import { StatusService, DEFAULT_STATUS_DEFINITIONS } from '../src/status';
import { Principal } from '../src/auth';

describe('StatusService', () => {
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

  it('rejects cashier from updating status definitions with 403 Forbidden', async () => {
    const mockPrisma = {} as any;
    const service = new StatusService(mockPrisma);

    await expect(
      service.update(principalCashier, 'TRANSFER', 'IN_TRANSIT', { label: 'ทดสอบ' })
    ).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('lists default status definitions when DB is empty', async () => {
    const mockPrisma = {
      systemStatusDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new StatusService(mockPrisma);
    const list = await service.list();

    expect(list.length).toBe(DEFAULT_STATUS_DEFINITIONS.length);
    const transferStatuses = await service.list({ domain: 'TRANSFER' });
    expect(transferStatuses.every((s) => s.domain === 'TRANSFER')).toBe(true);
    expect(transferStatuses).toHaveLength(3);
  });

  it('loads status definitions from database with custom labels and colors', async () => {
    const mockPrisma = {
      systemStatusDefinition: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'st-1',
            domain: 'TRANSFER',
            code: 'IN_TRANSIT',
            label: 'อยู่ระหว่างจัดส่งพิเศษ',
            color: '#b45309',
            bgColor: '#fef3c7',
            icon: 'Truck',
            sortOrder: 1,
            isTerminal: false,
            description: 'Custom transfer status',
          },
        ]),
      },
    } as any;

    const service = new StatusService(mockPrisma);
    const status = await service.getByDomainAndCode('TRANSFER', 'IN_TRANSIT');

    expect(status.label).toBe('อยู่ระหว่างจัดส่งพิเศษ');
    expect(status.color).toBe('#b45309');
    expect(status.bgColor).toBe('#fef3c7');
  });

  it('throws NotFoundException for unknown status domain or code', async () => {
    const mockPrisma = {
      systemStatusDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new StatusService(mockPrisma);
    await expect(service.getByDomainAndCode('TRANSFER', 'UNKNOWN_CODE')).rejects.toThrow('ไม่พบสถานะ');
    await expect(service.getByDomainAndCode('UNKNOWN_DOMAIN', 'TEST')).rejects.toThrow('ไม่พบสถานะ');
  });

  it('allows owner/manager to update status definition and upserts to database', async () => {
    const mockPrisma = {
      systemStatusDefinition: {
        upsert: vi.fn().mockResolvedValue({
          id: 'st-1',
          domain: 'SALE',
          code: 'VOIDED',
          label: 'ยกเลิกรายการขายด่วน (Void)',
          color: '#e11d48',
          bgColor: '#ffe4e6',
          icon: 'Ban',
          sortOrder: 3,
          isTerminal: true,
          description: 'ปรับเปลี่ยนคำอธิบายผ่านการทดสอบ',
        }),
      },
    } as any;

    const service = new StatusService(mockPrisma);
    const updated = await service.update(principalManager, 'SALE', 'VOIDED', {
      label: 'ยกเลิกรายการขายด่วน (Void)',
      color: '#e11d48',
      bgColor: '#ffe4e6',
      description: 'ปรับเปลี่ยนคำอธิบายผ่านการทดสอบ',
    });

    expect(updated.label).toBe('ยกเลิกรายการขายด่วน (Void)');
    expect(mockPrisma.systemStatusDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          domain_code: {
            domain: 'SALE',
            code: 'VOIDED',
          },
        },
        create: expect.objectContaining({
          domain: 'SALE',
          code: 'VOIDED',
          label: 'ยกเลิกรายการขายด่วน (Void)',
        }),
        update: expect.objectContaining({
          label: 'ยกเลิกรายการขายด่วน (Void)',
          color: '#e11d48',
        }),
      })
    );
  });
});
