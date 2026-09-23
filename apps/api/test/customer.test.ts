import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomerService } from '../src/customer';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const owner: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'owner-a', membershipId: 'member-a', role: 'OWNER', branchIds: [] };
const customerId = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('CustomerService', () => {
  it('lists customers matching query', async () => {
    const db = {
      customer: { findMany: vi.fn().mockResolvedValue([{ id: customerId, name: 'คุณสมศรี', phone: '0812345678', points: 15 }]) },
    };
    const service = new CustomerService(db as unknown as Database);
    const result = await service.list(owner, 'สมศรี');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('คุณสมศรี');
    expect(db.customer.findMany).toHaveBeenCalled();
  });

  it('rejects duplicate phone numbers within the same tenant', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' });
    const tx = {
      customer: { create: vi.fn().mockRejectedValue(error) },
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const service = new CustomerService(db as unknown as Database);
    await expect(service.create(owner, {
      name: 'คุณสมชาย',
      phone: '0812345678',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('retrieves customer details or throws 404', async () => {
    const db = {
      customer: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new CustomerService(db as unknown as Database);
    await expect(service.getById(owner, customerId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
