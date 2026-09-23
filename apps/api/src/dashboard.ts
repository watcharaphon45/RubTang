import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { parse } from './validation';

@Injectable()
export class DashboardService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async getMetrics(principal: Principal, branchIdQuery?: unknown) {
    let branchId: string | undefined;
    if (branchIdQuery && typeof branchIdQuery === 'string' && branchIdQuery.trim().length > 0) {
      branchId = parse(z.string().uuid(), branchIdQuery);
      requireBranch(principal, branchId);
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

    const saleBaseWhere: Prisma.SaleWhereInput = {
      tenantId: principal.tenantId,
      status: 'COMPLETED',
      ...(branchId
        ? { branchId }
        : principal.role !== 'OWNER'
        ? { branchId: { in: principal.branchIds } }
        : {}),
    };

    // 1. Today sales & bills
    const todaySalesRecords = await this.db.sale.findMany({
      where: {
        ...saleBaseWhere,
        createdAt: { gte: startOfToday },
      },
      select: { total: true, paymentMethod: true },
    });
    const todaySales = todaySalesRecords.reduce((sum, s) => sum + Number(s.total), 0);
    const todayBills = todaySalesRecords.length;

    // 2. Yesterday sales
    const yesterdaySalesRecords = await this.db.sale.findMany({
      where: {
        ...saleBaseWhere,
        createdAt: { gte: startOfYesterday, lt: startOfToday },
      },
      select: { total: true },
    });
    const yesterdaySales = yesterdaySalesRecords.reduce((sum, s) => sum + Number(s.total), 0);

    // 3. Month sales & bills
    const monthSalesRecords = await this.db.sale.findMany({
      where: {
        ...saleBaseWhere,
        createdAt: { gte: startOfMonth },
      },
      select: { total: true },
    });
    const monthSales = monthSalesRecords.reduce((sum, s) => sum + Number(s.total), 0);
    const monthBills = monthSalesRecords.length;

    // 4. Last 7 days trend
    const last7DaysSales = await this.db.sale.findMany({
      where: {
        ...saleBaseWhere,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { total: true, createdAt: true },
    });

    const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
      const nextD = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      const dayTotal = last7DaysSales
        .filter(s => s.createdAt >= d && s.createdAt < nextD)
        .reduce((sum, s) => sum + Number(s.total), 0);

      dailySales.push({
        date: d.toISOString().slice(0, 10),
        dayLabel: dayNames[d.getUTCDay()],
        amount: dayTotal,
      });
    }

    // 5. Top 5 selling products
    const topSaleItems = await this.db.saleItem.groupBy({
      by: ['productId', 'name'],
      where: {
        sale: saleBaseWhere,
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const topProducts = topSaleItems.map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item._sum.quantity ?? 0),
      revenue: Number(item._sum.subtotal ?? 0),
    }));

    // 6. Low stock products (quantity <= 5)
    const lowStockBalances = await this.db.inventoryBalance.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(branchId
          ? { branchId }
          : principal.role !== 'OWNER'
          ? { branchId: { in: principal.branchIds } }
          : {}),
        quantity: { lte: 5 },
        product: { active: true },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
      take: 10,
    });

    const lowStock = lowStockBalances.map(b => ({
      productId: b.product.id,
      name: b.product.name,
      sku: b.product.sku,
      branchName: b.branch.name,
      quantity: Number(b.quantity),
    }));

    // 7. Payment breakdown (Today)
    let cashSales = 0;
    let transferSales = 0;
    todaySalesRecords.forEach(s => {
      if (s.paymentMethod === 'CASH') cashSales += Number(s.total);
      else transferSales += Number(s.total);
    });

    // 8. Branch comparison (month sales)
    const branches = await this.db.branch.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(principal.role !== 'OWNER' ? { id: { in: principal.branchIds } } : {}),
      },
      select: { id: true, name: true },
    });

    const branchComparison = await Promise.all(
      branches.map(async b => {
        const bSales = await this.db.sale.aggregate({
          where: {
            tenantId: principal.tenantId,
            branchId: b.id,
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth },
          },
          _sum: { total: true },
        });
        return {
          branchId: b.id,
          name: b.name,
          sales: Number(bSales._sum.total ?? 0),
        };
      }),
    );

    return {
      metrics: {
        todaySales,
        todayBills,
        yesterdaySales,
        monthSales,
        monthBills,
        lowStockCount: lowStock.length,
      },
      dailySales,
      topProducts,
      lowStock,
      paymentBreakdown: {
        cash: cashSales,
        transfer: transferSales,
      },
      branchComparison,
    };
  }
}
