import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DashboardService } from '../src/dashboard';
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

const branch1Id = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const unauthorizedBranchId = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

describe('DashboardService', () => {
  it('blocks cashier from viewing metrics of unauthorized branch', async () => {
    const service = new DashboardService({} as unknown as Database);
    await expect(
      service.getMetrics(cashier, unauthorizedBranchId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aggregates today sales, top products and low stock items', async () => {
    const db = {
      sale: {
        findMany: vi.fn()
          // 1. today sales
          .mockResolvedValueOnce([
            { total: new Prisma.Decimal('120.00'), paymentMethod: 'CASH' },
            { total: new Prisma.Decimal('80.00'), paymentMethod: 'TRANSFER' },
          ])
          // 2. yesterday sales
          .mockResolvedValueOnce([
            { total: new Prisma.Decimal('150.00') },
          ])
          // 3. month sales
          .mockResolvedValueOnce([
            { total: new Prisma.Decimal('120.00') },
            { total: new Prisma.Decimal('80.00') },
            { total: new Prisma.Decimal('150.00') },
          ])
          // 4. last 7 days sales
          .mockResolvedValueOnce([
            { total: new Prisma.Decimal('200.00'), createdAt: new Date() },
          ]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { total: new Prisma.Decimal('350.00') } }),
      },
      saleItem: {
        groupBy: vi.fn().mockResolvedValue([
          {
            productId: 'prod-1',
            name: 'กาแฟอเมริกาโน่',
            _sum: { quantity: new Prisma.Decimal('10'), subtotal: new Prisma.Decimal('550.00') },
          },
          {
            productId: 'prod-2',
            name: 'น้ำดื่ม',
            _sum: { quantity: new Prisma.Decimal('6'), subtotal: new Prisma.Decimal('60.00') },
          },
        ]),
      },
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            quantity: new Prisma.Decimal('2.000'),
            product: { id: 'prod-3', name: 'ชาเขียว', sku: 'TEA-1' },
            branch: { id: branch1Id, name: 'สาขาหลัก' },
          },
        ]),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: branch1Id, name: 'สาขาหลัก' },
        ]),
      },
    };

    const service = new DashboardService(db as unknown as Database);
    const result = await service.getMetrics(owner, branch1Id);

    // Metrics verification
    expect(result.metrics.todaySales).toBe(200);
    expect(result.metrics.todayBills).toBe(2);
    expect(result.metrics.yesterdaySales).toBe(150);
    expect(result.metrics.monthSales).toBe(350);
    expect(result.metrics.lowStockCount).toBe(1);

    // Payment breakdown
    expect(result.paymentBreakdown.cash).toBe(120);
    expect(result.paymentBreakdown.transfer).toBe(80);

    // Top products
    expect(result.topProducts).toHaveLength(2);
    expect(result.topProducts[0].name).toBe('กาแฟอเมริกาโน่');
    expect(result.topProducts[0].quantity).toBe(10);

    // Low stock
    expect(result.lowStock).toHaveLength(1);
    expect(result.lowStock[0].name).toBe('ชาเขียว');
    expect(result.lowStock[0].quantity).toBe(2);

    // 7 days
    expect(result.dailySales).toHaveLength(7);
  });
});
