import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BranchStaffService } from '../src/branch-staff';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const owner: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'owner-a', membershipId: 'member-a', role: 'OWNER', branchIds: [] };
const cashier: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'user-b', membershipId: 'member-b', role: 'CASHIER', branchIds: ['branch-1'] };
const branch1Id = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('BranchStaffService', () => {
  it('rejects branch creation from non-owner', async () => {
    const service = new BranchStaffService({} as unknown as Database);
    await expect(service.createBranch(cashier, { name: 'New Branch' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects staff creation from non-owner', async () => {
    const service = new BranchStaffService({} as unknown as Database);
    await expect(service.createStaff(cashier, {
      displayName: 'Staff 1',
      email: 'staff@example.com',
      password: 'password12345',
      role: 'CASHIER',
      branchIds: [branch1Id],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates branch existence before creating staff', async () => {
    const db = {
      branch: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new BranchStaffService(db as unknown as Database);
    await expect(service.createStaff(owner, {
      displayName: 'Staff 1',
      email: 'staff@example.com',
      password: 'password12345',
      role: 'CASHIER',
      branchIds: [branch1Id],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates branch and audit record in a single transaction', async () => {
    const createdBranch = { id: branch1Id, name: 'สาขาทองหล่อ' };
    const tx = {
      branch: { create: vi.fn().mockResolvedValue(createdBranch) },
      branchAssignment: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new BranchStaffService(db as unknown as Database);
    const result = await service.createBranch(owner, { name: 'สาขาทองหล่อ' });
    expect(result).toEqual(createdBranch);
    expect(tx.branch.create).toHaveBeenCalledWith({
      data: { tenantId: owner.tenantId, name: 'สาขาทองหล่อ' },
      select: { id: true, name: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: owner.tenantId,
        actorUserId: owner.userId,
        action: 'BRANCH_CREATED',
        entityId: branch1Id,
        newValue: { name: 'สาขาทองหล่อ' },
      },
    });
  });
});
