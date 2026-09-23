import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StockTakeService } from '../src/stock-take';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const owner: Principal = {
  tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb',
  userId: 'owner-a',
  membershipId: 'member-owner',
  role: 'OWNER',
  branchIds: [],
};

const cashier: Principal = {
  tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb',
  userId: 'cashier-b',
  membershipId: 'member-cashier',
  role: 'CASHIER',
  branchIds: ['b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb'],
};

const branchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const stockTakeId = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const productId1 = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const itemId1 = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('StockTakeService', () => {
  it('blocks cashier from creating stock take sessions', async () => {
    const service = new StockTakeService({} as unknown as Database);
    await expect(
      service.create(cashier, { branchId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows owner to create stock take session and snapshots products and balances', async () => {
    const fakeBranch = { id: branchId, tenantId: owner.tenantId, name: 'สาขาหลัก' };
    const fakeProducts = [
      { id: productId1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', price: new Prisma.Decimal('55.00') },
    ];
    const fakeBalances = [
      { productId: productId1, quantity: new Prisma.Decimal('20.000') },
    ];

    const fakeCreatedTake = {
      id: stockTakeId,
      tenantId: owner.tenantId,
      branchId,
      takeNumber: 'ST-260923-0101',
      status: 'IN_PROGRESS' as const,
    };

    const tx = {
      branch: { findFirst: vi.fn().mockResolvedValue(fakeBranch) },
      product: { findMany: vi.fn().mockResolvedValue(fakeProducts) },
      inventoryBalance: { findMany: vi.fn().mockResolvedValue(fakeBalances) },
      stockTake: { create: vi.fn().mockResolvedValue(fakeCreatedTake) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => any) => cb(tx)),
    } as unknown as Database;

    const service = new StockTakeService(db);
    const result = await service.create(owner, { branchId, note: 'ตรวจนับสิ้นเดือน' });

    expect(result.id).toBe(stockTakeId);
    expect(tx.stockTake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          status: 'IN_PROGRESS',
          items: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                productId: productId1,
                systemQuantity: new Prisma.Decimal('20.000'),
                countedQuantity: new Prisma.Decimal('20.000'),
                variance: new Prisma.Decimal(0),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('updates counted quantities and calculates variance', async () => {
    const fakeTake = {
      id: stockTakeId,
      tenantId: owner.tenantId,
      branchId,
      status: 'IN_PROGRESS' as const,
    };

    const fakeItem = {
      id: itemId1,
      stockTakeId,
      productId: productId1,
      systemQuantity: new Prisma.Decimal('20.000'),
      countedQuantity: new Prisma.Decimal('20.000'),
      variance: new Prisma.Decimal('0.000'),
      unitPrice: new Prisma.Decimal('50.00'),
      varianceValue: new Prisma.Decimal('0.00'),
      note: null,
    };

    const tx = {
      stockTake: { findFirst: vi.fn().mockResolvedValue(fakeTake) },
      stockTakeItem: {
        findFirst: vi.fn().mockResolvedValue(fakeItem),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => any) => cb(tx)),
    } as unknown as Database;

    const service = new StockTakeService(db);
    const result = await service.updateCounts(owner, stockTakeId, {
      items: [
        {
          itemId: itemId1,
          countedQuantity: '18.000',
          note: 'สินค้าชำรุด 2 ชิ้น',
        },
      ],
    });

    expect(result.success).toBe(true);
    // variance = 18 - 20 = -2, varianceValue = -2 * 50 = -100
    expect(tx.stockTakeItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: itemId1 },
        data: expect.objectContaining({
          countedQuantity: new Prisma.Decimal('18.000'),
          variance: new Prisma.Decimal('-2.000'),
          varianceValue: new Prisma.Decimal('-100.00'),
          note: 'สินค้าชำรุด 2 ชิ้น',
        }),
      }),
    );
  });

  it('reconciles and approves stock take, updating inventory balance and creating StockMovement', async () => {
    const fakeTake = {
      id: stockTakeId,
      tenantId: owner.tenantId,
      branchId,
      takeNumber: 'ST-260923-0101',
      status: 'IN_PROGRESS' as const,
      items: [
        {
          id: itemId1,
          productId: productId1,
          systemQuantity: new Prisma.Decimal('20.000'),
          countedQuantity: new Prisma.Decimal('18.000'),
          variance: new Prisma.Decimal('-2.000'),
          unitPrice: new Prisma.Decimal('50.00'),
          varianceValue: new Prisma.Decimal('-100.00'),
          note: 'สินค้าชำรุด 2 ชิ้น',
          product: { id: productId1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
        },
      ],
    };

    const tx = {
      stockTake: {
        findFirst: vi.fn().mockResolvedValue(fakeTake),
        update: vi.fn().mockResolvedValue({ ...fakeTake, status: 'COMPLETED' }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal('20.000') }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({ id: 'sm-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => any) => cb(tx)),
    } as unknown as Database;

    const service = new StockTakeService(db);
    const result = await service.reconcileAndApprove(owner, stockTakeId);

    expect(result.status).toBe('COMPLETED');
    expect(result.adjustedCount).toBe(1);

    // Verify stock balance was set to counted quantity (18.000)
    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: new Prisma.Decimal('18.000') },
      }),
    );

    // Verify StockMovement recorded ADJUSTMENT
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: new Prisma.Decimal('-2.000'),
          balanceBefore: new Prisma.Decimal('20.000'),
          balanceAfter: new Prisma.Decimal('18.000'),
          note: expect.stringContaining('ปรับยอดจากรอบตรวจนับ ST-260923-0101'),
        }),
      }),
    );
  });
});
