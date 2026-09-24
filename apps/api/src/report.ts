import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import {
  parse,
  productReportQuerySchema,
  salesReportQuerySchema,
  stockCardReportQuerySchema,
  vatReportQuerySchema,
} from './validation';

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

  async getVatSalesReport(principal: Principal, queryRaw: unknown) {
    const query = parse(vatReportQuerySchema, queryRaw);
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
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        receiptNumber: true,
        total: true,
        subtotal: true,
        discount: true,
        createdAt: true,
        branch: { select: { id: true, name: true } },
      },
    });

    const taxInvoices = await this.db.taxInvoice.findMany({
      where: {
        tenantId: principal.tenantId,
        status: 'ISSUED',
        saleId: { in: sales.map(s => s.id) },
      },
      select: {
        id: true,
        saleId: true,
        invoiceNumber: true,
        customerName: true,
        customerTaxId: true,
        customerBranchNumber: true,
        customerIsHeadOffice: true,
        taxableAmount: true,
        vatAmount: true,
        total: true,
      },
    });

    const invoiceBySaleId = new Map(taxInvoices.map(ti => [ti.saleId, ti]));

    let totalGrossSales = 0;
    let totalTaxableBase = 0;
    let totalOutputVat = 0;
    let fullInvoiceCount = 0;
    let abbCount = 0;

    const items = sales.map(s => {
      const full = invoiceBySaleId.get(s.id);
      const isFull = Boolean(full);

      let documentNumber = s.receiptNumber;
      let customerName = 'ลูกค้ารายย่อย / หน้าร้าน';
      let customerTaxId = '-';
      let customerBranch = '-';
      let taxable = 0;
      let vat = 0;
      let total = Number(s.total);

      if (full) {
        fullInvoiceCount += 1;
        documentNumber = full.invoiceNumber;
        customerName = full.customerName;
        customerTaxId = full.customerTaxId || '-';
        customerBranch = full.customerIsHeadOffice ? 'สนญ. (00000)' : full.customerBranchNumber || '00000';
        taxable = Number(full.taxableAmount);
        vat = Number(full.vatAmount);
        total = Number(full.total);
      } else {
        abbCount += 1;
        taxable = Math.round((total / 1.07) * 100) / 100;
        vat = Math.round((total - taxable) * 100) / 100;
      }

      totalGrossSales += total;
      totalTaxableBase += taxable;
      totalOutputVat += vat;

      return {
        saleId: s.id,
        createdAt: s.createdAt.toISOString(),
        branchId: s.branch.id,
        branchName: s.branch.name,
        documentNumber,
        invoiceType: isFull ? 'FULL' : 'ABB',
        customerName,
        customerTaxId,
        customerBranch,
        taxableAmount: taxable,
        vatAmount: vat,
        totalAmount: total,
      };
    });

    return {
      summary: {
        totalSalesCount: sales.length,
        totalGrossSales: Math.round(totalGrossSales * 100) / 100,
        totalTaxableBase: Math.round(totalTaxableBase * 100) / 100,
        totalOutputVat: Math.round(totalOutputVat * 100) / 100,
        fullInvoiceCount,
        abbCount,
      },
      items,
    };
  }

  async getStockCardReport(principal: Principal, queryRaw: unknown) {
    const query = parse(stockCardReportQuerySchema, queryRaw);
    if (query.branchId) {
      requireBranch(principal, query.branchId);
    }

    const where: Prisma.StockMovementWhereInput = {
      tenantId: principal.tenantId,
      ...(query.branchId
        ? { branchId: query.branchId }
        : principal.role !== 'OWNER'
        ? { branchId: { in: principal.branchIds } }
        : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const movements = await this.db.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true } },
        branch: { select: { id: true, name: true } },
        actor: { include: { user: { select: { displayName: true } } } },
      },
    });

    const items = movements.map(m => ({
      id: m.id,
      createdAt: m.createdAt.toISOString(),
      branchId: m.branchId,
      branchName: m.branch.name,
      productId: m.productId,
      productName: m.product.name,
      sku: m.product.sku,
      barcode: m.product.barcode || '-',
      type: m.type,
      quantity: Number(m.quantity),
      balanceBefore: Number(m.balanceBefore),
      balanceAfter: Number(m.balanceAfter),
      actorName: m.actor?.user?.displayName || 'ระบบ',
      note: m.note || '-',
    }));

    return {
      summary: {
        totalRecords: items.length,
      },
      items,
    };
  }
}
