import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Principal } from '../src/auth';
import { Database } from '../src/database';
import { assertReplay, InventoryService, nextBalance } from '../src/inventory';
import { movementSchema } from '../src/validation';

const principal: Principal = { tenantId: 'd4c04d7f-e7d7-4bd1-b48a-e18666a3ed17', membershipId: 'member', userId: 'user', role: 'OWNER', branchIds: [] };
const input = { requestId: '0bb4e1dd-8872-4b0a-a0ef-a01a0731d207', branchId: '4518b8e6-c7b7-4dcf-ad98-f209487a4b42', productId: '6f1d30c3-a9bc-461b-a73c-b2186fd82230', type: 'RECEIVE' as const, quantity: '0.125', note: 'Delivery' };

describe('inventory safeguards', () => {
  it('adds fractional stock without floating point rounding', () => {
    expect(nextBalance(new Prisma.Decimal('0.1'), new Prisma.Decimal('0.2')).toString()).toBe('0.3');
    expect(nextBalance(new Prisma.Decimal('1.125'), new Prisma.Decimal('-0.125')).toString()).toBe('1');
  });
  it('rejects negative balance and decimal overflow', () => {
    expect(() => nextBalance(new Prisma.Decimal(0), new Prisma.Decimal(-1))).toThrow(ConflictException);
    expect(() => nextBalance(new Prisma.Decimal('99999999999.999'), new Prisma.Decimal('0.001'))).toThrow(ConflictException);
  });
  it('validates positive receiving, nonzero adjustments, reason and decimal precision', () => {
    for (const quantity of ['0', '-0', '-1', '1.0001', '1e3']) expect(movementSchema.safeParse({ ...input, quantity }).success).toBe(false);
    expect(movementSchema.safeParse({ ...input, type: 'ADJUSTMENT', quantity: '-1.125' }).success).toBe(true);
    expect(movementSchema.safeParse({ ...input, note: '  ' }).success).toBe(false);
    expect(movementSchema.safeParse({ ...input, tenantId: principal.tenantId }).success).toBe(false);
  });
  it('accepts only an identical idempotent replay including actor and scope', () => {
    const existing = { ...input, actorMembershipId: principal.membershipId, quantity: new Prisma.Decimal('0.125') };
    expect(() => assertReplay(existing, { ...input, quantity: '00.125' }, principal)).not.toThrow();
    for (const patch of [{ quantity: '1' }, { note: 'Changed' }, { branchId: 'other' }, { productId: 'other' }]) {
      expect(() => assertReplay(existing, { ...input, ...patch }, principal)).toThrow(ConflictException);
    }
    expect(() => assertReplay(existing, input, { ...principal, membershipId: 'someone-else' })).toThrow(ConflictException);
  });
  it('blocks cashier and unassigned manager before starting a transaction', async () => {
    const db = { $transaction: vi.fn() };
    const service = new InventoryService(db as unknown as Database);
    await expect(service.record({ ...principal, role: 'CASHIER' }, input)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.record({ ...principal, role: 'MANAGER' }, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('bounds serialization retries and reports a retryable conflict', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Write conflict', { code: 'P2034', clientVersion: '6.19.3' });
    const db = { $transaction: vi.fn().mockRejectedValue(error) };
    await expect(new InventoryService(db as unknown as Database).record(principal, input)).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).toHaveBeenCalledTimes(4);
  });
});
