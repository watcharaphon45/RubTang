import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShiftService } from '../src/shift';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const cashier: Principal = {
  tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb',
  userId: 'cashier-b',
  membershipId: 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bc',
  role: 'CASHIER',
  branchIds: ['b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb'],
};

const branchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const unauthorizedBranchId = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const shiftId = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('ShiftService', () => {
  it('blocks cashier from accessing shift of unauthorized branch', async () => {
    const service = new ShiftService({} as unknown as Database);
    await expect(
      service.getCurrentShift(cashier, unauthorizedBranchId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns null shift when no open shift exists', async () => {
    const db = {
      shift: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Database;

    const service = new ShiftService(db);
    const result = await service.getCurrentShift(cashier, branchId);
    expect(result).toEqual({ shift: null });
  });

  it('computes live sales and expected cash for active shift', async () => {
    const db = {
      shift: {
        findFirst: vi.fn().mockResolvedValue({
          id: shiftId,
          branchId,
          cashierId: cashier.membershipId,
          status: 'OPEN',
          startingCash: new Prisma.Decimal('1000.00'),
          openedNote: 'กะเช้า',
          closedNote: null,
          openedAt: new Date('2026-09-23T01:00:00Z'),
          cashier: { user: { displayName: 'สมชาย ขายดี' } },
          sales: [
            { id: 's1', receiptNumber: 'REC-01', total: new Prisma.Decimal('250.00'), paymentMethod: 'CASH', createdAt: new Date() },
            { id: 's2', receiptNumber: 'REC-02', total: new Prisma.Decimal('150.00'), paymentMethod: 'TRANSFER', createdAt: new Date() },
            { id: 's3', receiptNumber: 'REC-03', total: new Prisma.Decimal('300.00'), paymentMethod: 'CASH', createdAt: new Date() },
          ],
        }),
      },
    } as unknown as Database;

    const service = new ShiftService(db);
    const result = await service.getCurrentShift(cashier, branchId);

    expect(result.shift).not.toBeNull();
    expect(result.shift?.startingCash).toBe(1000);
    expect(result.shift?.cashSales).toBe(550); // 250 + 300
    expect(result.shift?.transferSales).toBe(150);
    expect(result.shift?.expectedCash).toBe(1550); // 1000 + 550
    expect(result.shift?.salesCount).toBe(3);
    expect(result.shift?.cashierName).toBe('สมชาย ขายดี');
  });

  it('rejects opening a new shift if an open shift already exists', async () => {
    const db = {
      shift: {
        findFirst: vi.fn().mockResolvedValue({ id: shiftId, status: 'OPEN' }),
      },
    } as unknown as Database;

    const service = new ShiftService(db);
    await expect(
      service.openShift(cashier, {
        branchId,
        startingCash: '1000.00',
        note: 'กะใหม่',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('opens a new shift successfully', async () => {
    const now = new Date();
    const db = {
      shift: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: shiftId,
          branchId,
          cashierId: cashier.membershipId,
          status: 'OPEN',
          startingCash: new Prisma.Decimal('500.00'),
          openedNote: 'เริ่มกะ',
          closedNote: null,
          openedAt: now,
          cashier: { user: { displayName: 'สมชาย ขายดี' } },
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Database;

    const service = new ShiftService(db);
    const result = await service.openShift(cashier, {
      branchId,
      startingCash: '500.00',
      note: 'เริ่มกะ',
    });

    expect(result.id).toBe(shiftId);
    expect(result.startingCash).toBe(500);
    expect(result.expectedCash).toBe(500);
    expect(result.status).toBe('OPEN');
  });

  it('closes a shift, calculating expected cash and difference correctly', async () => {
    const closedDate = new Date();
    const db = {
      shift: {
        findFirst: vi.fn().mockResolvedValue({
          id: shiftId,
          branchId,
          status: 'OPEN',
          startingCash: new Prisma.Decimal('1000.00'),
          openedNote: 'เริ่มกะ',
          closedNote: null,
          sales: [
            { total: new Prisma.Decimal('500.00'), paymentMethod: 'CASH' },
            { total: new Prisma.Decimal('200.00'), paymentMethod: 'TRANSFER' },
          ],
          cashier: { user: { displayName: 'สมชาย ขายดี' } },
        }),
        update: vi.fn().mockImplementation(({ data }) => ({
          id: shiftId,
          branchId,
          cashierId: cashier.membershipId,
          status: data.status,
          startingCash: new Prisma.Decimal('1000.00'),
          cashSales: data.cashSales,
          transferSales: data.transferSales,
          expectedCash: data.expectedCash,
          actualCash: data.actualCash,
          difference: data.difference,
          openedNote: 'เริ่มกะ',
          closedNote: data.closedNote,
          openedAt: new Date(),
          closedAt: closedDate,
          cashier: { user: { displayName: 'สมชาย ขายดี' } },
        })),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-2' }),
      },
    } as unknown as Database;

    const service = new ShiftService(db);
    // Expected: 1000 starting + 500 cashSales = 1500 expectedCash
    // Actual: 1520 -> Difference: +20
    const result = await service.closeShift(cashier, shiftId, {
      actualCash: '1520.00',
      note: 'เงินเกิน 20 บาท',
    });

    expect(result.status).toBe('CLOSED');
    expect(result.cashSales).toBe(500);
    expect(result.transferSales).toBe(200);
    expect(result.expectedCash).toBe(1500);
    expect(result.actualCash).toBe(1520);
    expect(result.difference).toBe(20);
  });
});
