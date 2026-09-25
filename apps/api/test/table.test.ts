import { describe, expect, it, vi } from 'vitest';
import { TableService } from '../src/table';
import { Principal } from '../src/auth';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('TableService & Dynamic QR Ordering', () => {
  const ownerPrincipal: Principal = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    membershipId: 'mem-1',
    role: 'OWNER',
    branchIds: ['branch-1'],
  };

  const cashierPrincipal: Principal = {
    userId: 'user-2',
    tenantId: 'tenant-1',
    membershipId: 'mem-2',
    role: 'CASHIER',
    branchIds: ['branch-1'],
  };

  it('lists tables for branch with active session details', async () => {
    const mockTables = [
      {
        id: 'table-1',
        number: 'T-01',
        name: 'โต๊ะ 1 (ริมหน้าต่าง)',
        zone: 'Indoor',
        capacity: 4,
        status: 'AVAILABLE',
        sessions: [
          {
            id: 'sess-1',
            sessionToken: 'token-abc-123',
            status: 'OPEN',
            openedAt: new Date('2026-09-25T10:00:00Z'),
            guestCount: 2,
            note: 'ขอน้ำเปล่า 2 แก้ว',
            orders: [
              {
                id: 'ord-1',
                orderNumber: 'ORD-001',
                status: 'PENDING',
                items: [
                  { productId: 'prod-1', quantity: 2, subtotal: 100 },
                  { productId: 'prod-2', quantity: 1, subtotal: 50 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'table-2',
        number: 'T-02',
        name: 'โต๊ะ 2',
        zone: 'Outdoor',
        capacity: 2,
        status: 'AVAILABLE',
        sessions: [],
      },
    ];

    const mockDb: any = {
      diningTable: {
        findMany: vi.fn().mockResolvedValue(mockTables),
      },
    };

    const service = new TableService(mockDb);
    const result = await service.listTables(ownerPrincipal, 'branch-1');

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('OCCUPIED'); // Has open session
    expect(result[0].activeSession?.totalAmount).toBe(150);
    expect(result[0].activeSession?.totalItems).toBe(3);
    expect(result[0].activeSession?.pendingOrdersCount).toBe(1);
    expect(result[1].status).toBe('AVAILABLE');
    expect(result[1].activeSession).toBeNull();
  });

  it('opens a new table session and generates secure dynamic token', async () => {
    const mockTable = {
      id: 'table-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      number: 'T-01',
      name: 'โต๊ะ 1',
      branch: { id: 'branch-1', name: 'สาขาหลัก', tenant: { name: 'ร้านทดสอบ' } },
    };

    const mockCreatedSession = {
      id: 'sess-new-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      tableId: 'table-1',
      sessionToken: 'generated-token-xyz',
      status: 'OPEN',
      guestCount: 3,
      note: 'ลูกค้านั่งในห้องแอร์',
    };

    const mockDb: any = {
      diningTable: {
        findUnique: vi.fn().mockResolvedValue(mockTable),
        update: vi.fn().mockResolvedValue({ ...mockTable, status: 'OCCUPIED' }),
      },
      tableSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(mockCreatedSession),
      },
    };

    const service = new TableService(mockDb);
    const result = await service.openSession(ownerPrincipal, 'table-1', {
      guestCount: 3,
      note: 'ลูกค้านั่งในห้องแอร์',
    });

    expect(result.session.sessionToken).toBeTruthy();
    expect(result.orderUrl).toContain('/order?token=');
    expect(mockDb.diningTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'OCCUPIED' },
    });
  });

  it('closes a session and resets table to AVAILABLE', async () => {
    const mockSession = {
      id: 'sess-1',
      tenantId: 'tenant-1',
      tableId: 'table-1',
      status: 'OPEN',
    };

    const mockDb: any = {
      tableSession: {
        findUnique: vi.fn().mockResolvedValue(mockSession),
        update: vi.fn().mockResolvedValue({ ...mockSession, status: 'CLOSED' }),
        count: vi.fn().mockResolvedValue(0),
      },
      diningTable: {
        update: vi.fn().mockResolvedValue({ id: 'table-1', status: 'AVAILABLE' }),
      },
    };

    const service = new TableService(mockDb);
    await service.closeSession(ownerPrincipal, 'sess-1', 'sale-uuid-1');

    expect(mockDb.tableSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ status: 'CLOSED', saleId: 'sale-uuid-1' }),
      }),
    );
    expect(mockDb.diningTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('public customer gets session details and active menu with prices', async () => {
    const mockSession = {
      id: 'sess-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      sessionToken: 'valid-token-123',
      status: 'OPEN',
      openedAt: new Date(),
      guestCount: 2,
      tenant: { id: 'tenant-1', name: 'รับตังค์ ชาบู' },
      branch: { id: 'branch-1', name: 'สาขาสยาม', phone: '0812345678' },
      table: { id: 'table-1', number: 'A-05', name: 'โต๊ะ 5 โซนกระจก', zone: 'Zone A' },
      orders: [],
    };

    const mockProducts = [
      {
        id: 'p-1',
        name: 'ชุดหมูคุโรบูตะรวม',
        sku: 'PORK-01',
        barcode: null,
        price: 299,
        inventory: [{ quantity: 15 }],
      },
      {
        id: 'p-2',
        name: 'ชาเขียวเย็น รีฟิล',
        sku: 'DRINK-01',
        barcode: null,
        price: 39,
        inventory: [{ quantity: 50 }],
      },
    ];

    const mockDb: any = {
      tableSession: {
        findUnique: vi.fn().mockResolvedValue(mockSession),
      },
      product: {
        findMany: vi.fn().mockResolvedValue(mockProducts),
      },
    };

    const service = new TableService(mockDb);
    const result = await service.getPublicSession('valid-token-123');

    expect(result.expired).toBe(false);
    expect(result.table.number).toBe('A-05');
    expect(result.menu).toHaveLength(2);
    expect(result.menu[0].price).toBe(299);
    expect(result.menu[0].inStock).toBe(true);
  });

  it('customer submits new order successfully with calculated subtotals', async () => {
    const mockSession = {
      id: 'sess-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      status: 'OPEN',
      table: { id: 'table-1', number: 'T-01' },
    };

    const mockProducts = [
      { id: 'p-1', name: 'กะเพราหมูกรอบ', sku: 'FOOD-01', price: 65 },
      { id: 'p-2', name: 'ไข่ดาว', sku: 'TOP-01', price: 10 },
    ];

    const mockDb: any = {
      tableSession: {
        findUnique: vi.fn().mockResolvedValue(mockSession),
      },
      product: {
        findMany: vi.fn().mockResolvedValue(mockProducts),
      },
      tableOrder: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ord-new-1', ...data })),
      },
    };

    const service = new TableService(mockDb);
    const result = await service.submitPublicOrder('valid-token-123', {
      items: [
        { productId: 'p-1', quantity: 2, note: 'เผ็ดน้อย' },
        { productId: 'p-2', quantity: 2 },
      ],
      note: 'ไม่ใส่ชูรส',
    });

    expect(result.success).toBe(true);
    expect(mockDb.tableOrder.create).toHaveBeenCalled();
  });
});
