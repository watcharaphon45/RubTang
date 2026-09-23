import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { closeShiftSchema, openShiftSchema, parse } from './validation';

function formatShiftNotes(shift: { openedNote?: string | null; closedNote?: string | null }) {
  if (shift.openedNote && shift.closedNote) {
    return `${shift.openedNote} | ${shift.closedNote}`;
  }
  return shift.closedNote || shift.openedNote || null;
}

@Injectable()
export class ShiftService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async getCurrentShift(principal: Principal, branchIdQuery: unknown) {
    const branchId = parse(z.string().uuid('รหัสสาขาไม่ถูกต้อง'), branchIdQuery);
    requireBranch(principal, branchId);

    const shift = await this.db.shift.findFirst({
      where: {
        tenantId: principal.tenantId,
        branchId,
        status: 'OPEN',
      },
      include: {
        cashier: {
          select: {
            user: { select: { displayName: true } },
          },
        },
        sales: {
          where: { status: 'COMPLETED' },
          select: {
            id: true,
            receiptNumber: true,
            total: true,
            paymentMethod: true,
            createdAt: true,
          },
        },
      },
    });

    if (!shift) {
      return { shift: null };
    }

    const cashSales = shift.sales
      .filter(s => s.paymentMethod === 'CASH')
      .reduce((sum, s) => sum + Number(s.total), 0);
    const transferSales = shift.sales
      .filter(s => s.paymentMethod === 'TRANSFER')
      .reduce((sum, s) => sum + Number(s.total), 0);
    const startingCash = Number(shift.startingCash);
    const expectedCash = startingCash + cashSales;

    return {
      shift: {
        id: shift.id,
        branchId: shift.branchId,
        cashierId: shift.cashierId,
        cashierName: shift.cashier?.user?.displayName || 'ไม่ระบุชื่อ',
        status: shift.status,
        startingCash,
        cashSales,
        transferSales,
        expectedCash,
        salesCount: shift.sales.length,
        notes: formatShiftNotes(shift),
        openedAt: shift.openedAt,
      },
    };
  }

  async openShift(principal: Principal, body: unknown) {
    const input = parse(openShiftSchema, body);
    requireBranch(principal, input.branchId);

    const existing = await this.db.shift.findFirst({
      where: {
        tenantId: principal.tenantId,
        branchId: input.branchId,
        status: 'OPEN',
      },
    });

    if (existing) {
      throw new ConflictException('มีกะงานเปิดค้างอยู่แล้วในสาขานี้ กรุณาปิดกะเดิมก่อน');
    }

    const startingCashDec = new Prisma.Decimal(input.startingCash);

    const shift = await this.db.shift.create({
      data: {
        tenantId: principal.tenantId,
        branchId: input.branchId,
        cashierId: principal.membershipId,
        status: 'OPEN',
        startingCash: startingCashDec,
        expectedCash: startingCashDec,
        openedNote: input.note || null,
      },
      include: {
        cashier: { select: { user: { select: { displayName: true } } } },
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'SHIFT_OPENED',
        entityId: shift.id,
        newValue: {
          branchId: input.branchId,
          startingCash: input.startingCash,
          openedAt: shift.openedAt,
        },
      },
    });

    return {
      id: shift.id,
      branchId: shift.branchId,
      cashierId: shift.cashierId,
      cashierName: shift.cashier?.user?.displayName || 'ไม่ระบุชื่อ',
      status: shift.status,
      startingCash: Number(shift.startingCash),
      cashSales: 0,
      transferSales: 0,
      expectedCash: Number(shift.startingCash),
      salesCount: 0,
      notes: formatShiftNotes(shift),
      openedAt: shift.openedAt,
    };
  }

  async closeShift(principal: Principal, shiftId: string, body: unknown) {
    const parsedId = parse(z.string().uuid('รหัสกะไม่ถูกต้อง'), shiftId);
    const input = parse(closeShiftSchema, body);

    const shift = await this.db.shift.findFirst({
      where: {
        id: parsedId,
        tenantId: principal.tenantId,
      },
      include: {
        sales: {
          where: { status: 'COMPLETED' },
          select: { total: true, paymentMethod: true },
        },
        cashier: {
          select: { user: { select: { displayName: true } } },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('ไม่พบกะงาน');
    }

    if (shift.status === 'CLOSED') {
      throw new ConflictException('กะงานนี้ถูกปิดไปแล้ว');
    }

    requireBranch(principal, shift.branchId);

    const cashSales = shift.sales
      .filter(s => s.paymentMethod === 'CASH')
      .reduce((sum, s) => sum + Number(s.total), 0);
    const transferSales = shift.sales
      .filter(s => s.paymentMethod === 'TRANSFER')
      .reduce((sum, s) => sum + Number(s.total), 0);
    const startingCash = Number(shift.startingCash);
    const expectedCash = startingCash + cashSales;
    const actualCash = Number(input.actualCash);
    const difference = actualCash - expectedCash;

    const updated = await this.db.shift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        cashSales: new Prisma.Decimal(cashSales),
        transferSales: new Prisma.Decimal(transferSales),
        expectedCash: new Prisma.Decimal(expectedCash),
        actualCash: new Prisma.Decimal(actualCash),
        difference: new Prisma.Decimal(difference),
        closedAt: new Date(),
        closedNote: input.note || null,
      },
      include: {
        cashier: { select: { user: { select: { displayName: true } } } },
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'SHIFT_CLOSED',
        entityId: updated.id,
        newValue: {
          expectedCash,
          actualCash,
          difference,
          closedAt: updated.closedAt,
        },
      },
    });

    return {
      id: updated.id,
      branchId: updated.branchId,
      cashierId: updated.cashierId,
      cashierName: updated.cashier?.user?.displayName || 'ไม่ระบุชื่อ',
      status: updated.status,
      startingCash: Number(updated.startingCash),
      cashSales: Number(updated.cashSales),
      transferSales: Number(updated.transferSales),
      expectedCash: Number(updated.expectedCash),
      actualCash: Number(updated.actualCash),
      difference: Number(updated.difference),
      notes: formatShiftNotes(updated),
      openedAt: updated.openedAt,
      closedAt: updated.closedAt,
    };
  }

  async listShifts(principal: Principal, branchIdQuery?: unknown) {
    let branchId: string | undefined;
    if (branchIdQuery && typeof branchIdQuery === 'string' && branchIdQuery.trim().length > 0) {
      branchId = parse(z.string().uuid(), branchIdQuery);
      requireBranch(principal, branchId);
    }

    const where: Prisma.ShiftWhereInput = {
      tenantId: principal.tenantId,
      ...(branchId
        ? { branchId }
        : principal.role !== 'OWNER'
        ? { branchId: { in: principal.branchIds } }
        : {}),
    };

    const shifts = await this.db.shift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: {
        cashier: { select: { user: { select: { displayName: true } } } },
        _count: { select: { sales: true } },
      },
    });

    return shifts.map(s => ({
      id: s.id,
      branchId: s.branchId,
      cashierId: s.cashierId,
      cashierName: s.cashier?.user?.displayName || 'ไม่ระบุชื่อ',
      status: s.status,
      startingCash: Number(s.startingCash),
      cashSales: Number(s.cashSales),
      transferSales: Number(s.transferSales),
      expectedCash: Number(s.expectedCash),
      actualCash: s.actualCash ? Number(s.actualCash) : null,
      difference: s.difference ? Number(s.difference) : null,
      salesCount: s._count.sales,
      notes: formatShiftNotes(s),
      openedAt: s.openedAt,
      closedAt: s.closedAt,
    }));
  }
}
