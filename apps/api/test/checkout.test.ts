import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CheckoutService } from '../src/checkout';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const owner: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'owner-a', membershipId: 'member-a', role: 'OWNER', branchIds: [] };
const cashier: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'user-b', membershipId: 'member-b', role: 'CASHIER', branchIds: ['branch-1'] };
const branch1Id = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const product1Id = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('CheckoutService', () => {
  it('blocks cashier accessing unauthorized branch', async () => {
    const service = new CheckoutService({} as unknown as Database);
    await expect(service.processCheckout(cashier, {
      branchId: 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb',
      items: [{ productId: product1Id, quantity: 1 }],
      paymentMethod: 'CASH',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects checkout when stock is insufficient', async () => {
    const tx = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: branch1Id, name: 'สาขาหลัก' }) },
      product: { findFirst: vi.fn().mockResolvedValue({ id: product1Id, name: 'น้ำดื่ม', sku: 'D1', price: new Prisma.Decimal('10.00'), active: true }) },
      inventoryBalance: { findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal('1.000') }) },
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new CheckoutService(db as unknown as Database);
    await expect(service.processCheckout(owner, {
      branchId: branch1Id,
      items: [{ productId: product1Id, quantity: 5 }],
      paymentMethod: 'CASH',
    })).rejects.toThrow(ConflictException);
  });

  it('deducts inventory and creates sale atomically', async () => {
    const tx = {
      branch: { findFirst: vi.fn().mockResolvedValue({ id: branch1Id, name: 'สาขาหลัก' }) },
      product: { findFirst: vi.fn().mockResolvedValue({ id: product1Id, name: 'น้ำดื่ม', sku: 'D1', price: new Prisma.Decimal('10.00'), active: true }) },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal('10.000') }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({}) },
      shift: { findFirst: vi.fn().mockResolvedValue(null) },
      sale: {
        create: vi.fn().mockResolvedValue({
          id: 'sale-1',
          receiptNumber: 'REC-260923-0001',
          createdAt: new Date(),
          paymentMethod: 'CASH',
          cashier: { user: { displayName: 'เจ้าของร้าน' } },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new CheckoutService(db as unknown as Database);
    const receipt = await service.processCheckout(owner, {
      branchId: branch1Id,
      items: [{ productId: product1Id, quantity: 2 }],
      discount: '5.00',
      paymentMethod: 'CASH',
      receivedAmount: '20.00',
    });

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: { tenantId_branchId_productId: { tenantId: owner.tenantId, branchId: branch1Id, productId: product1Id } },
      create: { tenantId: owner.tenantId, branchId: branch1Id, productId: product1Id, quantity: new Prisma.Decimal('8.000') },
      update: { quantity: new Prisma.Decimal('8.000') },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'SALE',
        quantity: new Prisma.Decimal('-2'),
        balanceBefore: new Prisma.Decimal('10.000'),
        balanceAfter: new Prisma.Decimal('8.000'),
      }),
    });
    expect(receipt.subtotal).toBe('20.00');
    expect(receipt.discount).toBe('5.00');
    expect(receipt.total).toBe('15.00');
    expect(receipt.change).toBe('5.00');
  });
});
