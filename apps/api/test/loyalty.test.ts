import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LoyaltyService, calculateTier } from '../src/loyalty';
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

const customerId = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('calculateTier', () => {
  it('correctly maps lifetime points to membership tiers', () => {
    expect(calculateTier(0)).toBe('BRONZE');
    expect(calculateTier(299)).toBe('BRONZE');
    expect(calculateTier(300)).toBe('SILVER');
    expect(calculateTier(999)).toBe('SILVER');
    expect(calculateTier(1000)).toBe('GOLD');
    expect(calculateTier(1999)).toBe('GOLD');
    expect(calculateTier(2000)).toBe('PLATINUM');
    expect(calculateTier(5000)).toBe('PLATINUM');
  });
});

describe('LoyaltyService', () => {
  it('blocks cashier from manually adjusting points', async () => {
    const service = new LoyaltyService({} as unknown as Database);
    await expect(
      service.adjustPoints(cashier, customerId, {
        amount: 50,
        reason: 'เพิ่มแต้มพิเศษ',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows owner to adjust points and updates tier & records PointLedger', async () => {
    const fakeCustomer = {
      id: customerId,
      name: 'สมชาย ใจดี',
      phone: '0812345678',
      points: 100,
      lifetimePoints: 250,
      tier: 'BRONZE' as const,
    };

    const updatedCustomer = {
      ...fakeCustomer,
      points: 160,
      lifetimePoints: 310,
      tier: 'SILVER' as const,
    };

    const fakeLedger = {
      id: 'ledger-uuid-1',
      tenantId: owner.tenantId,
      customerId,
      actorMembershipId: owner.membershipId,
      type: 'ADJUST' as const,
      amount: 60,
      balanceAfter: 160,
      reason: 'ลูกค้าVIP ปรับแต้มชดเชย',
      createdAt: new Date('2026-09-23T10:00:00Z'),
    };

    const tx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(fakeCustomer),
        update: vi.fn().mockResolvedValue(updatedCustomer),
      },
      pointLedger: {
        create: vi.fn().mockResolvedValue(fakeLedger),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => any) => cb(tx)),
    } as unknown as Database;

    const service = new LoyaltyService(db);
    const result = await service.adjustPoints(owner, customerId, {
      amount: 60,
      reason: 'ลูกค้าVIP ปรับแต้มชดเชย',
    });

    expect(result.customer.points).toBe(160);
    expect(result.customer.tier).toBe('SILVER');
    expect(result.ledger.amount).toBe(60);
    expect(result.ledger.balanceAfter).toBe(160);
    expect(tx.pointLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUST',
          amount: 60,
          balanceAfter: 160,
        }),
      }),
    );
  });

  it('rejects point deduction if customer does not have enough points', async () => {
    const fakeCustomer = {
      id: customerId,
      name: 'สมชาย',
      phone: '0812345678',
      points: 20,
      lifetimePoints: 100,
      tier: 'BRONZE' as const,
    };

    const tx = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(fakeCustomer),
      },
    };

    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => any) => cb(tx)),
    } as unknown as Database;

    const service = new LoyaltyService(db);
    await expect(
      service.adjustPoints(owner, customerId, {
        amount: -50,
        reason: 'หักแต้ม',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retrieves customer ledger correctly', async () => {
    const fakeCustomer = {
      id: customerId,
      name: 'สมหญิง',
      phone: '0899999999',
      points: 150,
      lifetimePoints: 400,
      tier: 'SILVER' as const,
    };

    const fakeLedgers = [
      {
        id: 'l-1',
        type: 'EARN' as const,
        amount: 50,
        balanceAfter: 150,
        reason: 'สะสมแต้มจากบิล REC-1',
        createdAt: new Date('2026-09-23T11:00:00Z'),
        sale: { receiptNumber: 'REC-1', total: new Prisma.Decimal('2500.00') },
        actor: { user: { displayName: 'แคชเชียร์ 1' } },
      },
    ];

    const db = {
      customer: {
        findFirst: vi.fn().mockResolvedValue(fakeCustomer),
      },
      pointLedger: {
        findMany: vi.fn().mockResolvedValue(fakeLedgers),
      },
    } as unknown as Database;

    const service = new LoyaltyService(db);
    const result = await service.getCustomerLedger(owner, customerId);

    expect(result.customer.name).toBe('สมหญิง');
    expect(result.ledgers).toHaveLength(1);
    expect(result.ledgers[0].saleReceiptNumber).toBe('REC-1');
  });

  it('allows owner to manage loyalty rewards', async () => {
    const fakeReward = {
      id: 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb',
      tenantId: owner.tenantId,
      title: 'ส่วนลด 50 บาท',
      pointsCost: 50,
      discountAmount: new Prisma.Decimal('50.00'),
      active: true,
      createdAt: new Date('2026-09-23T10:00:00Z'),
    };

    const db = {
      loyaltyReward: {
        findMany: vi.fn().mockResolvedValue([fakeReward]),
        create: vi.fn().mockResolvedValue(fakeReward),
        findFirst: vi.fn().mockResolvedValue(fakeReward),
        update: vi.fn().mockResolvedValue({ ...fakeReward, active: false }),
      },
    } as unknown as Database;

    const service = new LoyaltyService(db);
    const rewards = await service.listRewards(owner);
    expect(rewards).toHaveLength(1);
    expect(rewards[0].pointsCost).toBe(50);

    const created = await service.createReward(owner, {
      title: 'ส่วนลด 50 บาท',
      pointsCost: 50,
      discountAmount: '50.00',
    });
    expect(created.title).toBe('ส่วนลด 50 บาท');

    const toggled = await service.toggleReward(owner, fakeReward.id);
    expect(toggled.active).toBe(false);
  });
});
