import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutService } from '../src/checkout';
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

const branch1Id = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const sale1Id = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const product1Id = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const customer1Id = 'f0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('SalesHistory and VoidSale', () => {
  it('lists sales history with customer and status', async () => {
    const db = {
      sale: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: sale1Id,
            receiptNumber: 'REC-260923-0001',
            status: 'COMPLETED',
            createdAt: new Date('2026-09-23T10:00:00Z'),
            branch: { name: 'สาขาหลัก' },
            cashier: { user: { displayName: 'แคชเชียร์ 1' } },
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            customer: { id: customer1Id, name: 'คุณสมชาย', phone: '0812345678' },
            subtotal: new Prisma.Decimal('100.00'),
            discount: new Prisma.Decimal('10.00'),
            total: new Prisma.Decimal('90.00'),
            paymentMethod: 'CASH',
            items: [
              {
                productId: product1Id,
                name: 'กาแฟ',
                sku: 'COF-1',
                price: new Prisma.Decimal('50.00'),
                quantity: new Prisma.Decimal('2'),
                subtotal: new Prisma.Decimal('100.00'),
              },
            ],
          },
        ]),
      },
    };

    const service = new CheckoutService(db as unknown as Database);
    const result = await service.listSales(owner, branch1Id);

    expect(result).toHaveLength(1);
    expect(result[0].receiptNumber).toBe('REC-260923-0001');
    expect(result[0].customer?.name).toBe('คุณสมชาย');
    expect(result[0].status).toBe('COMPLETED');
    expect(result[0].total).toBe('90.00');
  });

  it('rejects cashier attempting to void a sale', async () => {
    const service = new CheckoutService({} as unknown as Database);
    await expect(
      service.voidSale(cashier, sale1Id, { reason: 'ลูกค้าขอเงินคืน' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects voiding an already voided sale', async () => {
    const tx = {
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: sale1Id,
          branchId: branch1Id,
          status: 'VOIDED',
          items: [],
        }),
      },
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };

    const service = new CheckoutService(db as unknown as Database);
    await expect(
      service.voidSale(owner, sale1Id, { reason: 'ลูกค้าเปลี่ยนใจ' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('voids sale, restores inventory, reverses points, and logs audit', async () => {
    const tx = {
      sale: {
        findFirst: vi.fn().mockResolvedValue({
          id: sale1Id,
          tenantId: owner.tenantId,
          branchId: branch1Id,
          status: 'COMPLETED',
          receiptNumber: 'REC-260923-0001',
          total: new Prisma.Decimal('100.00'),
          customerId: customer1Id,
          customer: { id: customer1Id, points: 15 },
          items: [
            {
              productId: product1Id,
              quantity: new Prisma.Decimal('2'),
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({
          id: sale1Id,
          receiptNumber: 'REC-260923-0001',
          status: 'VOIDED',
          createdAt: new Date(),
          branch: { name: 'สาขาหลัก' },
          cashier: { user: { displayName: 'แคชเชียร์ 1' } },
          voidedBy: { user: { displayName: 'เจ้าของร้าน' } },
          voidedAt: new Date(),
          voidReason: 'ลูกค้าเปลี่ยนใจ ไม่รับสินค้า',
          customer: { id: customer1Id, name: 'คุณสมชาย', phone: '0812345678' },
          subtotal: new Prisma.Decimal('100.00'),
          discount: new Prisma.Decimal('0.00'),
          total: new Prisma.Decimal('100.00'),
          paymentMethod: 'CASH',
        }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal('8.000') }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
      customer: {
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };

    const service = new CheckoutService(db as unknown as Database);
    const result = await service.voidSale(owner, sale1Id, {
      reason: 'ลูกค้าเปลี่ยนใจ ไม่รับสินค้า',
    });

    expect(result.status).toBe('VOIDED');
    expect(result.voidReason).toBe('ลูกค้าเปลี่ยนใจ ไม่รับสินค้า');

    // Check stock was returned: 8 + 2 = 10
    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { quantity: new Prisma.Decimal('10.000') },
      }),
    );

    // Check stock movement VOID_SALE created
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'VOID_SALE',
          note: expect.stringContaining('ยกเลิกบิล REC-260923-0001'),
        }),
      }),
    );

    // Check customer points reversed: 100 THB / 50 = 2 points reversed (15 - 2 = 13)
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: customer1Id },
        data: expect.objectContaining({ points: 13 }),
      }),
    );

    // Check audit log
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SALE_VOID',
          entityId: sale1Id,
        }),
      }),
    );
  });
});
