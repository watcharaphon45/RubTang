import { PrismaClient, Prisma } from '@prisma/client';
import { Principal, requireBranch } from './auth';
import { ForbiddenException, NotFoundException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Database } from './database';
import { parse, createTaxInvoiceSchema, updateBranchTaxSettingsSchema } from './validation';

export function bahtText(input: number | string): string {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  if (!Number.isFinite(num)) return 'ศูนย์บาทถ้วน';
  if (num === 0) return 'ศูนย์บาทถ้วน';
  if (num < 0) return `ลบ${bahtText(Math.abs(num))}`;

  const fixed = num.toFixed(2);
  const [bahtStr, stangStr] = fixed.split('.');
  const wholeBaht = parseInt(bahtStr, 10);

  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  function readBlock(str: string, isLowestChunk: boolean, wholeValue: number): string {
    let result = '';
    const len = str.length;
    const chunkVal = parseInt(str, 10);
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i], 10);
      const pos = len - i - 1;
      if (digit !== 0) {
        if (pos === 1 && digit === 1) {
          result += 'สิบ';
        } else if (pos === 1 && digit === 2) {
          result += 'ยี่สิบ';
        } else if (pos === 0 && digit === 1) {
          if (isLowestChunk) {
            result += wholeValue > 1 ? 'เอ็ด' : 'หนึ่ง';
          } else {
            result += chunkVal > 1 ? 'เอ็ด' : 'หนึ่ง';
          }
        } else {
          result += digits[digit] + units[pos];
        }
      }
    }
    return result;
  }

  function readBaht(str: string): string {
    if (str === '0' || !str) return '';
    let rem = str;
    const chunks: string[] = [];
    while (rem.length > 6) {
      chunks.unshift(rem.slice(-6));
      rem = rem.slice(0, -6);
    }
    chunks.unshift(rem);

    let result = '';
    for (let i = 0; i < chunks.length; i++) {
      const isLowest = i === chunks.length - 1;
      const chunkText = readBlock(chunks[i], isLowest, wholeBaht);
      if (chunkText) {
        result += chunkText;
        if (i < chunks.length - 1) {
          result += 'ล้าน';
        }
      }
    }
    return result;
  }

  const bahtTextPart = readBaht(bahtStr);
  const stang = parseInt(stangStr, 10);

  if (stang === 0) {
    return (bahtTextPart || 'ศูนย์') + 'บาทถ้วน';
  }

  const stangTextPart = readBlock(stangStr, true, stang);
  return (bahtTextPart ? `${bahtTextPart}บาท` : '') + `${stangTextPart}สตางค์`;
}

export function calculateVat(netAmount: number, rate = 7) {
  // VAT-inclusive calculation: Base = Net * 100 / (100 + Rate)
  const taxableAmount = Math.round((netAmount * 100 / (100 + rate)) * 100) / 100;
  const vatAmount = Math.round((netAmount - taxableAmount) * 100) / 100;
  return {
    taxableAmount: taxableAmount.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    vatRate: rate.toFixed(2),
  };
}

@Injectable()
export class TaxInvoiceService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async createTaxInvoice(principal: Principal, saleId: string, body: unknown) {
    const data = parse(createTaxInvoiceSchema, body);

    return this.db.$transaction(async tx => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId: principal.tenantId },
        include: {
          items: true,
          branch: true,
          customer: true,
        },
      });

      if (!sale) throw new NotFoundException('ไม่พบรายการขาย');
      requireBranch(principal, sale.branchId);

      if (sale.status === 'VOIDED') {
        throw new ConflictException('ไม่สามารถออกใบกำกับภาษีสำหรับบิลที่ถูกยกเลิกแล้ว');
      }

      // Check if active full tax invoice already exists for this sale
      const existing = await tx.taxInvoice.findFirst({
        where: {
          tenantId: principal.tenantId,
          saleId: sale.id,
          status: 'ISSUED',
        },
      });

      if (existing) {
        return this.formatTaxInvoice(existing, sale, sale.branch);
      }

      // Generate Invoice Number: TAX-YYMMDD-XXXX
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const prefix = `TAX-${yy}${mm}${dd}-`;

      const latest = await tx.taxInvoice.findFirst({
        where: {
          tenantId: principal.tenantId,
          invoiceNumber: { startsWith: prefix },
        },
        orderBy: { invoiceNumber: 'desc' },
      });

      let nextSeq = 1;
      if (latest) {
        const lastSeqStr = latest.invoiceNumber.slice(prefix.length);
        const parsed = parseInt(lastSeqStr, 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      const invoiceNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

      // Calculations
      const subtotalNum = Number(sale.subtotal);
      const discountNum = Number(sale.discount) + Number(sale.pointsDiscount ?? 0);
      const totalNum = Number(sale.total);
      const { taxableAmount, vatAmount, vatRate } = calculateVat(totalNum, 7);
      const bahtTextStr = bahtText(totalNum);

      const taxInvoice = await tx.taxInvoice.create({
        data: {
          tenantId: principal.tenantId,
          branchId: sale.branchId,
          saleId: sale.id,
          invoiceNumber,
          type: 'FULL',
          status: 'ISSUED',
          customerName: data.customerName,
          customerTaxId: data.customerTaxId || null,
          customerAddress: data.customerAddress || null,
          customerBranchNumber: data.customerBranchNumber || '00000',
          customerIsHeadOffice: data.customerIsHeadOffice ?? true,
          customerPhone: data.customerPhone || null,
          subtotal: new Prisma.Decimal(subtotalNum.toFixed(2)),
          discount: new Prisma.Decimal(discountNum.toFixed(2)),
          taxableAmount: new Prisma.Decimal(taxableAmount),
          vatRate: new Prisma.Decimal(vatRate),
          vatAmount: new Prisma.Decimal(vatAmount),
          total: new Prisma.Decimal(totalNum.toFixed(2)),
          bahtText: bahtTextStr,
          issuedById: principal.membershipId,
          note: data.note || null,
        },
      });

      return this.formatTaxInvoice(taxInvoice, sale, sale.branch);
    });
  }

  async getTaxInvoice(principal: Principal, id: string) {
    const taxInvoice = await this.db.taxInvoice.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        branch: true,
        sale: {
          include: {
            items: true,
            cashier: { select: { user: { select: { displayName: true } } } },
          },
        },
        issuedBy: { select: { user: { select: { displayName: true } } } },
      },
    });

    if (!taxInvoice) throw new NotFoundException('ไม่พบใบกำกับภาษี');
    requireBranch(principal, taxInvoice.branchId);

    return this.formatTaxInvoice(taxInvoice, taxInvoice.sale, taxInvoice.branch, taxInvoice.issuedBy?.user.displayName);
  }

  async getTaxInvoiceBySaleId(principal: Principal, saleId: string) {
    const sale = await this.db.sale.findFirst({
      where: { id: saleId, tenantId: principal.tenantId },
      include: { branch: true },
    });
    if (!sale) throw new NotFoundException('ไม่พบรายการขาย');
    requireBranch(principal, sale.branchId);

    const taxInvoice = await this.db.taxInvoice.findFirst({
      where: {
        tenantId: principal.tenantId,
        saleId,
        status: 'ISSUED',
      },
      include: {
        branch: true,
        sale: {
          include: {
            items: true,
            cashier: { select: { user: { select: { displayName: true } } } },
          },
        },
        issuedBy: { select: { user: { select: { displayName: true } } } },
      },
    });

    if (!taxInvoice) return null;
    return this.formatTaxInvoice(taxInvoice, taxInvoice.sale, taxInvoice.branch, taxInvoice.issuedBy?.user.displayName);
  }

  async updateBranchTaxSettings(principal: Principal, branchId: string, body: unknown) {
    if (principal.role !== 'OWNER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านเท่านั้นที่สามารถแก้ไขข้อมูลภาษีสาขาได้');
    }
    requireBranch(principal, branchId);
    const data = parse(updateBranchTaxSettingsSchema, body);

    const updated = await this.db.branch.update({
      where: {
        tenantId_id: {
          tenantId: principal.tenantId,
          id: branchId,
        },
      },
      data: {
        companyName: data.companyName,
        taxId: data.taxId,
        taxAddress: data.taxAddress,
        branchNumber: data.branchNumber ?? '00000',
        isHeadOffice: data.isHeadOffice ?? true,
        phone: data.phone,
        receiptHeader: data.receiptHeader,
        receiptFooter: data.receiptFooter,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      companyName: updated.companyName,
      taxId: updated.taxId,
      taxAddress: updated.taxAddress,
      branchNumber: updated.branchNumber,
      isHeadOffice: updated.isHeadOffice,
      phone: updated.phone,
      receiptHeader: updated.receiptHeader,
      receiptFooter: updated.receiptFooter,
    };
  }

  async getBranchTaxSettings(principal: Principal, branchId: string) {
    requireBranch(principal, branchId);
    const branch = await this.db.branch.findUnique({
      where: {
        tenantId_id: {
          tenantId: principal.tenantId,
          id: branchId,
        },
      },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    return {
      id: branch.id,
      name: branch.name,
      companyName: branch.companyName,
      taxId: branch.taxId,
      taxAddress: branch.taxAddress,
      branchNumber: branch.branchNumber,
      isHeadOffice: branch.isHeadOffice,
      phone: branch.phone,
      receiptHeader: branch.receiptHeader,
      receiptFooter: branch.receiptFooter,
    };
  }

  private formatTaxInvoice(
    inv: any,
    sale: any,
    branch: any,
    issuerName?: string,
  ) {
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      status: inv.status,
      saleId: inv.saleId,
      receiptNumber: sale.receiptNumber,
      issuedAt: inv.issuedAt.toISOString(),
      issuedByName: issuerName ?? 'พนักงาน',
      // Store / Issuer info
      issuer: {
        name: branch.companyName || branch.name,
        taxId: branch.taxId || '-',
        address: branch.taxAddress || '-',
        branchNumber: branch.branchNumber || '00000',
        isHeadOffice: branch.isHeadOffice ?? true,
        phone: branch.phone || '-',
        receiptHeader: branch.receiptHeader || null,
        receiptFooter: branch.receiptFooter || null,
      },
      // Customer info
      customer: {
        name: inv.customerName,
        taxId: inv.customerTaxId || null,
        address: inv.customerAddress || null,
        branchNumber: inv.customerBranchNumber || '00000',
        isHeadOffice: inv.customerIsHeadOffice ?? true,
        phone: inv.customerPhone || null,
      },
      // Financials
      subtotal: inv.subtotal.toFixed(2),
      discount: inv.discount.toFixed(2),
      taxableAmount: inv.taxableAmount.toFixed(2),
      vatRate: inv.vatRate.toFixed(2),
      vatAmount: inv.vatAmount.toFixed(2),
      total: inv.total.toFixed(2),
      bahtText: inv.bahtText,
      paymentMethod: sale.paymentMethod,
      note: inv.note || null,
      // Items
      items: sale.items?.map((it: any) => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        price: it.price.toFixed(2),
        quantity: it.quantity.toString(),
        subtotal: it.subtotal.toFixed(2),
      })) || [],
    };
  }
}
