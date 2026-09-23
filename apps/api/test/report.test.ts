import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ReportService } from '../src/report';
import { Principal } from '../src/auth';
import { Database } from '../src/database';

const tenantId = 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const branchId = 'b0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const productId1 = 'd0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';
const productId2 = 'e0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb';

const owner: Principal = {
  tenantId,
  userId: 'owner-a',
  membershipId: 'member-owner',
  role: 'OWNER',
  branchIds: [],
};

describe('ReportService', () => {
  it('calculates sales report summary and daily rows correctly', async () => {
    const db = {
      sale: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sale-1',
            total: new Prisma.Decimal('100.00'),
            subtotal: new Prisma.Decimal('110.00'),
            discount: new Prisma.Decimal('10.00'),
            paymentMethod: 'CASH',
            createdAt: new Date('2026-09-20T10:00:00Z'),
          },
          {
            id: 'sale-2',
            total: new Prisma.Decimal('200.00'),
            subtotal: new Prisma.Decimal('200.00'),
            discount: new Prisma.Decimal('0.00'),
            paymentMethod: 'TRANSFER',
            createdAt: new Date('2026-09-20T14:30:00Z'),
          },
          {
            id: 'sale-3',
            total: new Prisma.Decimal('150.00'),
            subtotal: new Prisma.Decimal('150.00'),
            discount: new Prisma.Decimal('0.00'),
            paymentMethod: 'CASH',
            createdAt: new Date('2026-09-21T09:15:00Z'),
          },
        ]),
      },
    } as unknown as Database;

    const service = new ReportService(db);
    const result = await service.getSalesReport(owner, {});

    expect(result.summary.totalSales).toBe(450);
    expect(result.summary.totalBills).toBe(3);
    expect(result.summary.averageOrderValue).toBe(150);
    expect(result.summary.totalDiscount).toBe(10);
    expect(result.summary.totalCash).toBe(250);
    expect(result.summary.totalTransfer).toBe(200);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].date).toBe('2026-09-20');
    expect(result.rows[0].bills).toBe(2);
    expect(result.rows[0].netSales).toBe(300);
    expect(result.rows[0].cashSales).toBe(100);
    expect(result.rows[0].transferSales).toBe(200);

    expect(result.rows[1].date).toBe('2026-09-21');
    expect(result.rows[1].bills).toBe(1);
    expect(result.rows[1].netSales).toBe(150);
  });

  it('aggregates top selling products with percentage share', async () => {
    const db = {
      sale: {
        findMany: vi.fn().mockResolvedValue([
          {
            items: [
              {
                productId: productId1,
                name: 'กาแฟอเมริกาโน่',
                sku: 'COFFEE-01',
                quantity: new Prisma.Decimal('3'),
                subtotal: new Prisma.Decimal('150.00'),
              },
              {
                productId: productId2,
                name: 'น้ำดื่ม 600 มล.',
                sku: 'DRINK-01',
                quantity: new Prisma.Decimal('5'),
                subtotal: new Prisma.Decimal('50.00'),
              },
            ],
          },
          {
            items: [
              {
                productId: productId1,
                name: 'กาแฟอเมริกาโน่',
                sku: 'COFFEE-01',
                quantity: new Prisma.Decimal('2'),
                subtotal: new Prisma.Decimal('100.00'),
              },
            ],
          },
        ]),
      },
    } as unknown as Database;

    const service = new ReportService(db);
    const result = await service.getTopProductsReport(owner, { limit: 10 });

    expect(result.totalRevenue).toBe(300);
    expect(result.items.length).toBe(2);

    // Rank 1: กาแฟ (250 baht, 5 cups, 83.3%)
    expect(result.items[0].productId).toBe(productId1);
    expect(result.items[0].quantitySold).toBe(5);
    expect(result.items[0].revenue).toBe(250);
    expect(result.items[0].sharePercent).toBe(83.3);

    // Rank 2: น้ำดื่ม (50 baht, 5 bottles, 16.7%)
    expect(result.items[1].productId).toBe(productId2);
    expect(result.items[1].quantitySold).toBe(5);
    expect(result.items[1].revenue).toBe(50);
    expect(result.items[1].sharePercent).toBe(16.7);
  });

  it('calculates inventory valuation and identifies out-of-stock and low-stock items', async () => {
    const db = {
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            productId: productId1,
            branchId,
            quantity: new Prisma.Decimal('20'),
            product: {
              id: productId1,
              name: 'กาแฟอเมริกาโน่',
              sku: 'COFFEE-01',
              barcode: '885001',
              price: new Prisma.Decimal('50.00'),
            },
            branch: { id: branchId, name: 'สาขาหลัก' },
          },
          {
            productId: productId2,
            branchId,
            quantity: new Prisma.Decimal('3'), // low stock <= 5
            product: {
              id: productId2,
              name: 'น้ำดื่ม',
              sku: 'DRINK-01',
              barcode: null,
              price: new Prisma.Decimal('10.00'),
            },
            branch: { id: branchId, name: 'สาขาหลัก' },
          },
          {
            productId: 'out-prod-id',
            branchId,
            quantity: new Prisma.Decimal('0'), // out of stock == 0
            product: {
              id: 'out-prod-id',
              name: 'ถุงกระดาษ',
              sku: 'BAG-01',
              barcode: null,
              price: new Prisma.Decimal('5.00'),
            },
            branch: { id: branchId, name: 'สาขาหลัก' },
          },
        ]),
      },
    } as unknown as Database;

    const service = new ReportService(db);
    const result = await service.getInventoryValuationReport(owner, branchId);

    expect(result.summary.totalSKUs).toBe(3);
    expect(result.summary.totalUnits).toBe(23); // 20 + 3 + 0
    expect(result.summary.totalValuation).toBe(1030); // (20*50) + (3*10) + (0*5) = 1000 + 30 = 1030
    expect(result.summary.outOfStockCount).toBe(1);
    expect(result.summary.lowStockCount).toBe(1);
  });
});
