import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { parse, productReportQuerySchema, salesReportQuerySchema } from './validation';

@Injectable()
export class ReportService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async getSalesReport(principal: Principal, queryRaw: unknown) {
    const query = parse(salesReportQuerySchema, queryRaw);
    if (query.branchId) {
      requireBranch(principal, query.branchId);
    }

    const where: Prisma.SaleWhereInput = {
      tenantId: principal.tenantId,
      status: 'COMPLETED',
      ...(query.branchId
        ? { branchId: query.branchId }
        : principal.role !== 'OWNER'
        ? { branchId: { in: principal.branchIds } }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const sales = await this.db.sale.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        total: true,
        subtotal: true,
        discount: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    const rowsMap = new Map<
      string,
      {
        date: string;
        bills: number;
        subtotal: number;
        discount: number;
        netSales: number;
        cashSales: number;
        transferSales: number;
      }
    >();

    let totalSales = 0;
    let totalDiscount = 0;
    let totalCash = 0;
    let totalTransfer = 0;

    for (const s of sales) {
      const d = s.createdAt;
      const dateKey =
        query.groupBy === 'month'
          ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
          : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
              d.getUTCDate(),
            ).padStart(2, '0')}`;

      const totalNum = Number(s.total);
      const subtotalNum = Number(s.subtotal);
      const discountNum = Number(s.discount);

      totalSales += totalNum;
      totalDiscount += discountNum;
      if (s.paymentMethod === 'CASH') totalCash += totalNum;
      if (s.paymentMethod === 'TRANSFER') totalTransfer += totalNum;

      const existing = rowsMap.get(dateKey) ?? {
        date: dateKey,
        bills: 0,
        subtotal: 0,
        discount: 0,
        netSales: 0,
        cashSales: 0,
        transferSales: 0,
      };

      existing.bills += 1;
      existing.subtotal += subtotalNum;
      existing.discount += discountNum;
      existing.netSales += totalNum;
      if (s.paymentMethod === 'CASH') existing.cashSales += totalNum;
      if (s.paymentMethod === 'TRANSFER') existing.transferSales += totalNum;

      rowsMap.set(dateKey, existing);
    }

    const rows = Array.from(rowsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const totalBills = sales.length;
    const averageOrderValue = totalBills > 0 ? totalSales / totalBills : 0;

    return {
      summary: {
        totalSales,
        totalBills,
        averageOrderValue,
        totalDiscount,
        totalCash,
        totalTransfer,
      },
      rows,
    };
  }

  async getTopProductsReport(principal: Principal, queryRaw: unknown) {
    const query = parse(productReportQuerySchema, queryRaw);
    if (query.branchId) {
      requireBranch(principal, query.branchId);
    }

    const saleWhere: Prisma.SaleWhereInput = {
      tenantId: principal.tenantId,
      status: 'COMPLETED',
      ...(query.branchId
        ? { branchId: query.branchId }
        : principal.role !== 'OWNER'
        ? { branchId: { in: principal.branchIds } }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const sales = await this.db.sale.findMany({
      where: saleWhere,
      select: {
        items: {
          select: {
            productId: true,
            name: true,
            sku: true,
            quantity: true,
            subtotal: true,
          },
        },
      },
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        name: string;
        sku: string;
        quantitySold: number;
        revenue: number;
      }
    >();

    let totalRevenueAll = 0;

    for (const s of sales) {
      for (const item of s.items) {
        const qty = Number(item.quantity);
        const rev = Number(item.subtotal);
        totalRevenueAll += rev;

        const existing = productMap.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          quantitySold: 0,
          revenue: 0,
        };

        existing.quantitySold += qty;
        existing.revenue += rev;
        productMap.set(item.productId, existing);
      }
    }

    const sorted = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, query.limit);

    const items = sorted.map(p => ({
      ...p,
      sharePercent:
        totalRevenueAll > 0 ? Math.round((p.revenue / totalRevenueAll) * 1000) / 10 : 0,
    }));

    return {
      totalRevenue: totalRevenueAll,
      items,
    };
  }

  async getInventoryValuationReport(principal: Principal, branchId?: string) {
    if (branchId) {
      requireBranch(principal, branchId);
    }

    const targetBranchId =
      branchId ?? (principal.role === 'OWNER' ? undefined : principal.branchIds[0]);

    const where: Prisma.InventoryBalanceWhereInput = {
      tenantId: principal.tenantId,
      ...(targetBranchId ? { branchId: targetBranchId } : {}),
      product: { active: true },
    };

    const balances = await this.db.inventoryBalance.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true, price: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    let totalUnits = 0;
    let totalValuation = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    const items = balances.map(b => {
      const qty = Number(b.quantity);
      const price = Number(b.product.price);
      const valuation = qty * price;

      totalUnits += qty;
      totalValuation += valuation;
      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= 5) lowStockCount += 1;

      return {
        productId: b.productId,
        productName: b.product.name,
        sku: b.product.sku,
        barcode: b.product.barcode,
        branchId: b.branchId,
        branchName: b.branch.name,
        quantity: qty,
        unitPrice: price,
        valuation,
      };
    });

    items.sort((a, b) => b.valuation - a.valuation);

    return {
      summary: {
        totalSKUs: items.length,
        totalUnits,
        totalValuation,
        outOfStockCount,
        lowStockCount,
      },
      items,
    };
  }
}
