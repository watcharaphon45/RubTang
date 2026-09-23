import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransferService } from '../src/transfer';
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

const originBranchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const destinationBranchId = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const productId = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const transferId = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('TransferService', () => {
  it('blocks cashier from creating transfers', async () => {
    const service = new TransferService({} as unknown as Database);
    await expect(
      service.createTransfer(cashier, {
        originBranchId,
        destinationBranchId,
        items: [{ productId, quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects transfer when origin stock is insufficient', async () => {
    const tx = {
      branch: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: originBranchId, name: 'สาขาสุขุมวิท' })
          .mockResolvedValueOnce({ id: destinationBranchId, name: 'สาขาสยาม' }),
      },
      stockTransfer: {
        create: vi.fn().mockResolvedValue({ id: transferId }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: productId,
          name: 'กาแฟอเมริกาโน่',
          active: true,
        }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({
          quantity: new Prisma.Decimal('3.000'), // only 3 available, trying to transfer 5
        }),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as Database;

    const service = new TransferService(db);

    await expect(
      service.createTransfer(owner, {
        originBranchId,
        destinationBranchId,
        items: [{ productId, quantity: 5 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('dispatches transfer, deducting origin stock and creating TRANSFER_OUT movement', async () => {
    const tx = {
      branch: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: originBranchId, name: 'สาขาสุขุมวิท' })
          .mockResolvedValueOnce({ id: destinationBranchId, name: 'สาขาสยาม' }),
      },
      stockTransfer: {
        create: vi.fn().mockResolvedValue({ id: transferId }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: transferId,
          transferNumber: 'TR-260923-0001',
          status: 'IN_TRANSIT',
          originBranch: { id: originBranchId, name: 'สาขาสุขุมวิท' },
          destinationBranch: { id: destinationBranchId, name: 'สาขาสยาม' },
          createdBy: { user: { displayName: 'เจ้าของร้าน' } },
          items: [
            {
              id: 'item-1',
              productId,
              quantity: new Prisma.Decimal('5.000'),
              product: { id: productId, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
            },
          ],
        }),
      },
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: productId,
          name: 'กาแฟอเมริกาโน่',
          active: true,
        }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({
          quantity: new Prisma.Decimal('20.000'),
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
      stockTransferItem: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as Database;

    const service = new TransferService(db);
    const result = await service.createTransfer(owner, {
      originBranchId,
      destinationBranchId,
      items: [{ productId, quantity: 5 }],
      note: 'โอนช่วยสาขาสยาม',
    });

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_branchId_productId: {
          tenantId: owner.tenantId,
          branchId: originBranchId,
          productId,
        },
      },
      create: {
        tenantId: owner.tenantId,
        branchId: originBranchId,
        productId,
        quantity: new Prisma.Decimal('15.000'), // 20 - 5
      },
      update: {
        quantity: new Prisma.Decimal('15.000'),
      },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'TRANSFER_OUT',
        quantity: new Prisma.Decimal(-5),
        branchId: originBranchId,
      }),
    });

    expect(result.status).toBe('IN_TRANSIT');
  });

  it('receives transfer at destination branch, increasing stock and marking COMPLETED', async () => {
    const receivedDate = new Date();
    const tx = {
      stockTransfer: {
        findFirst: vi.fn().mockResolvedValue({
          id: transferId,
          tenantId: owner.tenantId,
          transferNumber: 'TR-260923-0001',
          originBranchId,
          destinationBranchId,
          status: 'IN_TRANSIT',
          originBranch: { name: 'สาขาสุขุมวิท' },
          destinationBranch: { name: 'สาขาสยาม' },
          items: [
            {
              productId,
              quantity: new Prisma.Decimal('5.000'),
              product: { name: 'กาแฟอเมริกาโน่' },
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({
          id: transferId,
          status: 'COMPLETED',
          receivedAt: receivedDate,
          originBranch: { id: originBranchId, name: 'สาขาสุขุมวิท' },
          destinationBranch: { id: destinationBranchId, name: 'สาขาสยาม' },
          createdBy: { user: { displayName: 'เจ้าของร้าน' } },
          receivedBy: { user: { displayName: 'ผู้จัดการสยาม' } },
          items: [
            {
              productId,
              quantity: new Prisma.Decimal('5.000'),
              product: { id: productId, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
            },
          ],
        }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({
          quantity: new Prisma.Decimal('2.000'),
        }),
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
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as Database;

    const service = new TransferService(db);
    const result = await service.receiveTransfer(owner, transferId);

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_branchId_productId: {
          tenantId: owner.tenantId,
          branchId: destinationBranchId,
          productId,
        },
      },
      create: {
        tenantId: owner.tenantId,
        branchId: destinationBranchId,
        productId,
        quantity: new Prisma.Decimal('7.000'), // 2 + 5
      },
      update: {
        quantity: new Prisma.Decimal('7.000'),
      },
    });

    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'TRANSFER_IN',
        quantity: new Prisma.Decimal('5.000'),
        branchId: destinationBranchId,
      }),
    });

    expect(result.status).toBe('COMPLETED');
  });

  it('cancels transfer and returns stock to origin branch', async () => {
    const tx = {
      stockTransfer: {
        findFirst: vi.fn().mockResolvedValue({
          id: transferId,
          tenantId: owner.tenantId,
          transferNumber: 'TR-260923-0001',
          originBranchId,
          destinationBranchId,
          status: 'IN_TRANSIT',
          originBranch: { name: 'สาขาสุขุมวิท' },
          destinationBranch: { name: 'สาขาสยาม' },
          items: [
            {
              productId,
              quantity: new Prisma.Decimal('5.000'),
              product: { name: 'กาแฟอเมริกาโน่' },
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({
          id: transferId,
          status: 'CANCELLED',
          originBranch: { id: originBranchId, name: 'สาขาสุขุมวิท' },
          destinationBranch: { id: destinationBranchId, name: 'สาขาสยาม' },
          createdBy: { user: { displayName: 'เจ้าของร้าน' } },
          items: [],
        }),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue({
          quantity: new Prisma.Decimal('15.000'),
        }),
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
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as Database;

    const service = new TransferService(db);
    const result = await service.cancelTransfer(owner, transferId);

    expect(tx.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: {
        tenantId_branchId_productId: {
          tenantId: owner.tenantId,
          branchId: originBranchId,
          productId,
        },
      },
      create: {
        tenantId: owner.tenantId,
        branchId: originBranchId,
        productId,
        quantity: new Prisma.Decimal('20.000'), // 15 + 5 returned
      },
      update: {
        quantity: new Prisma.Decimal('20.000'),
      },
    });

    expect(result.status).toBe('CANCELLED');
  });
});
