import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromotionService } from '../src/promotion';
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

const branchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const promotionId = 'c0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('PromotionService', () => {
  it('blocks cashier from creating promotions', async () => {
    const service = new PromotionService({} as unknown as Database);
    await expect(
      service.createPromotion(cashier, {
        name: 'ลด 50 บาท',
        discountType: 'FIXED_AMOUNT',
        discountValue: '50.00',
        minSpend: '200.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects creation when coupon code already exists in tenant', async () => {
    const db = {
      promotion: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-id', code: 'RUBTANG50' }),
      },
    } as unknown as Database;

    const service = new PromotionService(db);
    await expect(
      service.createPromotion(owner, {
        name: 'ลด 50 บาท',
        code: 'RUBTANG50',
        discountType: 'FIXED_AMOUNT',
        discountValue: '50.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates fixed amount discount correctly', async () => {
    const db = {
      promotion: {
        findFirst: vi.fn().mockResolvedValue({
          id: promotionId,
          name: 'ลด 50 บาท',
          code: 'RUBTANG50',
          discountType: 'FIXED_AMOUNT',
          discountValue: new Prisma.Decimal('50.00'),
          minSpend: new Prisma.Decimal('300.00'),
          maxDiscount: null,
          branchId: null,
          active: true,
          startDate: null,
          endDate: null,
        }),
      },
    } as unknown as Database;

    const service = new PromotionService(db);
    const result = await service.validatePromotion(owner, {
      code: 'RUBTANG50',
      branchId,
      subtotal: '400.00',
    });

    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(50);
    expect(result.finalTotal).toBe(350);
  });

  it('rejects coupon when subtotal is below minimum spend', async () => {
    const db = {
      promotion: {
        findFirst: vi.fn().mockResolvedValue({
          id: promotionId,
          name: 'ลด 50 บาท',
          code: 'RUBTANG50',
          discountType: 'FIXED_AMOUNT',
          discountValue: new Prisma.Decimal('50.00'),
          minSpend: new Prisma.Decimal('300.00'),
          active: true,
        }),
      },
    } as unknown as Database;

    const service = new PromotionService(db);
    await expect(
      service.validatePromotion(owner, {
        code: 'RUBTANG50',
        branchId,
        subtotal: '250.00', // below 300
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates percentage discount with max discount ceiling', async () => {
    const db = {
      promotion: {
        findFirst: vi.fn().mockResolvedValue({
          id: promotionId,
          name: 'ลด 10% สูงสุด 100 บาท',
          code: 'SALE10',
          discountType: 'PERCENTAGE',
          discountValue: new Prisma.Decimal('10.00'),
          minSpend: new Prisma.Decimal('100.00'),
          maxDiscount: new Prisma.Decimal('100.00'),
          branchId: null,
          active: true,
        }),
      },
    } as unknown as Database;

    const service = new PromotionService(db);
    // Subtotal 1,500 * 10% = 150 -> capped at 100
    const result = await service.validatePromotion(owner, {
      code: 'SALE10',
      branchId,
      subtotal: '1500.00',
    });

    expect(result.valid).toBe(true);
    expect(result.discountAmount).toBe(100);
    expect(result.finalTotal).toBe(1400);
  });

  it('rejects coupon when promotion is inactive', async () => {
    const db = {
      promotion: {
        findFirst: vi.fn().mockResolvedValue({
          id: promotionId,
          name: 'ลด 50 บาท',
          code: 'INACTIVE50',
          active: false,
        }),
      },
    } as unknown as Database;

    const service = new PromotionService(db);
    await expect(
      service.validatePromotion(owner, {
        code: 'INACTIVE50',
        branchId,
        subtotal: '500.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
