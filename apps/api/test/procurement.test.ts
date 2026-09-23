import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProcurementService } from '../src/procurement';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const tenantId = 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const branchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const supplierId = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const productId = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

const owner: Principal = {
  tenantId,
  userId: 'owner-a',
  membershipId: 'member-owner',
  role: 'OWNER',
  branchIds: [],
};

const cashier: Principal = {
  tenantId,
  userId: 'cashier-b',
  membershipId: 'member-cashier',
  role: 'CASHIER',
  branchIds: [branchId],
};

describe('ProcurementService', () => {
  it('blocks cashier from creating supplier', async () => {
    const service = new ProcurementService({} as unknown as Database);
    await expect(
      service.createSupplier(cashier, { name: 'Supplier A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates supplier successfully for owner', async () => {
    const db = {
      supplier: {
        create: vi.fn().mockResolvedValue({
          id: supplierId,
          name: 'ABC Trading',
          contactName: 'คุณสมชาย',
          phone: '0812345678',
          email: 'abc@trading.com',
          address: '123 กทม.',
          creditDays: 30,
          active: true,
          createdAt: new Date(),
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Database;

    const service = new ProcurementService(db);
    const result = await service.createSupplier(owner, {
      name: 'ABC Trading',
      contactName: 'คุณสมชาย',
      phone: '0812345678',
      email: 'abc@trading.com',
      creditDays: 30,
    });

    expect(result.name).toBe('ABC Trading');
    expect(result.creditDays).toBe(30);
  });

  it('blocks cashier from creating purchase order', async () => {
    const service = new ProcurementService({} as unknown as Database);
    await expect(
      service.createPurchaseOrder(cashier, {
        supplierId,
        branchId,
        items: [{ productId, orderedQuantity: '10', unitCost: '50' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates purchase order with calculated total amount', async () => {
    const mockTx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: productId,
          name: 'เมล็ดกาแฟ',
          active: true,
        }),
      },
      purchaseOrder: {
        create: vi.fn().mockResolvedValue({
          id: 'po-1',
          poNumber: 'PO-260923-ABCD',
          status: 'ORDERED',
          totalAmount: new Prisma.Decimal('500.00'),
          note: 'สั่งด่วน',
          createdAt: new Date(),
          supplier: { name: 'ABC Trading' },
          branch: { name: 'สาขาหลัก' },
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };

    const db = {
      supplier: {
        findFirst: vi.fn().mockResolvedValue({ id: supplierId, active: true, name: 'ABC Trading' }),
      },
      branch: {
        findFirst: vi.fn().mockResolvedValue({ id: branchId, name: 'สาขาหลัก' }),
      },
      $transaction: vi.fn().mockImplementation(cb => cb(mockTx)),
    } as unknown as Database;

    const service = new ProcurementService(db);
    const result = await service.createPurchaseOrder(owner, {
      supplierId,
      branchId,
      items: [{ productId, orderedQuantity: '10', unitCost: '50.00' }],
      note: 'สั่งด่วน',
    });

    expect(result.poNumber).toBe('PO-260923-ABCD');
    expect(result.totalAmount).toBe(500);
    expect(result.status).toBe('ORDERED');
  });

  it('receives goods and updates inventory and movement records', async () => {
    const poItemId = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
    const mockTx = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'po-1',
          poNumber: 'PO-260923-0001',
          status: 'ORDERED',
          branchId,
          supplier: { name: 'ABC Trading' },
          items: [
            {
              id: poItemId,
              productId,
              orderedQuantity: new Prisma.Decimal(10),
              receivedQuantity: new Prisma.Decimal(0),
              product: { name: 'เมล็ดกาแฟ' },
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({
          id: 'po-1',
          poNumber: 'PO-260923-0001',
          status: 'RECEIVED',
          receivedAt: new Date(),
        }),
      },
      purchaseOrderItem: {
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          {
            id: poItemId,
            orderedQuantity: new Prisma.Decimal(10),
            receivedQuantity: new Prisma.Decimal(10),
          },
        ]),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal(5) }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: vi.fn().mockImplementation(cb => cb(mockTx)),
    } as unknown as Database;

    const service = new ProcurementService(db);
    const result = await service.receiveGoods(owner, 'po-1', {
      items: [{ purchaseOrderItemId: poItemId, receiveQuantity: '10' }],
    });

    expect(result.status).toBe('RECEIVED');
    expect(mockTx.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: new Prisma.Decimal(15) }),
        update: expect.objectContaining({ quantity: new Prisma.Decimal(15) }),
      }),
    );
    expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'RECEIVE',
          quantity: new Prisma.Decimal(10),
          balanceBefore: new Prisma.Decimal(5),
          balanceAfter: new Prisma.Decimal(15),
        }),
      }),
    );
  });

  it('rejects receiving more quantity than ordered', async () => {
    const poItemId = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
    const mockTx = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'po-1',
          poNumber: 'PO-260923-0001',
          status: 'ORDERED',
          branchId,
          supplier: { name: 'ABC Trading' },
          items: [
            {
              id: poItemId,
              productId,
              orderedQuantity: new Prisma.Decimal(5),
              receivedQuantity: new Prisma.Decimal(0),
              product: { name: 'เมล็ดกาแฟ' },
            },
          ],
        }),
      },
    };

    const db = {
      $transaction: vi.fn().mockImplementation(cb => cb(mockTx)),
    } as unknown as Database;

    const service = new ProcurementService(db);
    await expect(
      service.receiveGoods(owner, 'po-1', {
        items: [{ purchaseOrderItemId: poItemId, receiveQuantity: '10' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents cancelling PO when goods have already been received', async () => {
    const db = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'po-1',
          poNumber: 'PO-260923-0001',
          status: 'RECEIVED',
          branchId,
          items: [{ receivedQuantity: new Prisma.Decimal(10) }],
        }),
      },
    } as unknown as Database;

    const service = new ProcurementService(db);
    await expect(service.cancelPurchaseOrder(owner, 'po-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
