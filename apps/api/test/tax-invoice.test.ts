import { describe, expect, it, vi } from 'vitest';
import { bahtText, calculateVat, TaxInvoiceService } from '../src/tax-invoice';
import { Principal } from '../src/auth';
import { ForbiddenException, ConflictException } from '../src/database';
import { Prisma } from '@prisma/client';

describe('Tax Invoice & Baht Text', () => {
  describe('bahtText helper', () => {
    it('formats 0 correctly', () => {
      expect(bahtText(0)).toBe('ศูนย์บาทถ้วน');
      expect(bahtText('0.00')).toBe('ศูนย์บาทถ้วน');
    });

    it('formats single digits and teens correctly', () => {
      expect(bahtText(1)).toBe('หนึ่งบาทถ้วน');
      expect(bahtText(5)).toBe('ห้าบาทถ้วน');
      expect(bahtText(10)).toBe('สิบบาทถ้วน');
      expect(bahtText(11)).toBe('สิบเอ็ดบาทถ้วน');
      expect(bahtText(15)).toBe('สิบห้าบาทถ้วน');
    });

    it('formats tens and hundreds with เอ็ด correctly', () => {
      expect(bahtText(20)).toBe('ยี่สิบบาทถ้วน');
      expect(bahtText(21)).toBe('ยี่สิบเอ็ดบาทถ้วน');
      expect(bahtText(31)).toBe('สามสิบเอ็ดบาทถ้วน');
      expect(bahtText(100)).toBe('หนึ่งร้อยบาทถ้วน');
      expect(bahtText(101)).toBe('หนึ่งร้อยเอ็ดบาทถ้วน');
      expect(bahtText(121)).toBe('หนึ่งร้อยยี่สิบเอ็ดบาทถ้วน');
    });

    it('formats satang decimals correctly', () => {
      expect(bahtText(100.50)).toBe('หนึ่งร้อยบาทห้าสิบสตางค์');
      expect(bahtText(0.25)).toBe('ยี่สิบห้าสตางค์');
      expect(bahtText(50.05)).toBe('ห้าสิบบาทห้าสตางค์');
    });

    it('formats thousands and millions correctly', () => {
      expect(bahtText(1000)).toBe('หนึ่งพันบาทถ้วน');
      expect(bahtText(1000000)).toBe('หนึ่งล้านบาทถ้วน');
      expect(bahtText(1000001)).toBe('หนึ่งล้านเอ็ดบาทถ้วน');
    });
  });

  describe('calculateVat helper', () => {
    it('calculates 7% VAT included correctly', () => {
      const result = calculateVat(107, 7);
      expect(result.taxableAmount).toBe('100.00');
      expect(result.vatAmount).toBe('7.00');
      expect(result.vatRate).toBe('7.00');
    });

    it('rounds correctly for standard numbers', () => {
      const result = calculateVat(100, 7);
      expect(result.taxableAmount).toBe('93.46');
      expect(result.vatAmount).toBe('6.54');
    });
  });

  describe('TaxInvoiceService', () => {
    const mockPrincipalOwner: Principal = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'mem-1',
      role: 'OWNER',
      branchIds: ['branch-1'],
    };

    const mockPrincipalCashier: Principal = {
      tenantId: 'tenant-1',
      userId: 'user-2',
      membershipId: 'mem-2',
      role: 'CASHIER',
      branchIds: ['branch-1'],
    };

    it('creates a full tax invoice successfully', async () => {
      const mockSale = {
        id: 'sale-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        receiptNumber: 'REC-260923-0001',
        status: 'COMPLETED',
        subtotal: new Prisma.Decimal('100.00'),
        discount: new Prisma.Decimal('0.00'),
        pointsDiscount: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('100.00'),
        paymentMethod: 'CASH',
        branch: {
          id: 'branch-1',
          name: 'สาขาสุขุมวิท',
          companyName: 'บริษัท รับตังค์ จำกัด',
          taxId: '0105559999999',
          taxAddress: '123 สุขุมวิท กรุงเทพฯ',
          branchNumber: '00000',
          isHeadOffice: true,
          phone: '02-123-4567',
        },
        items: [
          {
            productId: 'p-1',
            name: 'กาแฟอเมริกาโน่',
            sku: 'COFFEE-001',
            price: new Prisma.Decimal('100.00'),
            quantity: new Prisma.Decimal('1.000'),
            subtotal: new Prisma.Decimal('100.00'),
          },
        ],
      };

      const mockCreatedTaxInvoice = {
        id: 'inv-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        saleId: 'sale-1',
        invoiceNumber: 'TAX-260923-0001',
        type: 'FULL',
        status: 'ISSUED',
        customerName: 'บริษัท ลูกค้าใจดี จำกัด',
        customerTaxId: '0105551234567',
        customerAddress: '456 พระราม 9 กรุงเทพฯ',
        customerBranchNumber: '00000',
        customerIsHeadOffice: true,
        customerPhone: '0812345678',
        subtotal: new Prisma.Decimal('100.00'),
        discount: new Prisma.Decimal('0.00'),
        taxableAmount: new Prisma.Decimal('93.46'),
        vatRate: new Prisma.Decimal('7.00'),
        vatAmount: new Prisma.Decimal('6.54'),
        total: new Prisma.Decimal('100.00'),
        bahtText: 'หนึ่งร้อยบาทถ้วน',
        issuedById: 'mem-1',
        issuedAt: new Date('2026-09-23T10:00:00Z'),
        note: 'ออกใบกำกับภาษีเต็มรูป',
      };

      const mockDb: any = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            sale: {
              findFirst: vi.fn().mockResolvedValue(mockSale),
            },
            taxInvoice: {
              findFirst: vi.fn()
                .mockResolvedValueOnce(null) // existing check
                .mockResolvedValueOnce(null), // latest check
              create: vi.fn().mockResolvedValue(mockCreatedTaxInvoice),
            },
          });
        }),
      };

      const service = new TaxInvoiceService(mockDb);
      const result = await service.createTaxInvoice(mockPrincipalOwner, 'sale-1', {
        customerName: 'บริษัท ลูกค้าใจดี จำกัด',
        customerTaxId: '0105551234567',
        customerAddress: '456 พระราม 9 กรุงเทพฯ',
        customerBranchNumber: '00000',
        customerIsHeadOffice: true,
        customerPhone: '0812345678',
      });

      expect(result.invoiceNumber).toBe('TAX-260923-0001');
      expect(result.total).toBe('100.00');
      expect(result.bahtText).toBe('หนึ่งร้อยบาทถ้วน');
      expect(result.customer.name).toBe('บริษัท ลูกค้าใจดี จำกัด');
      expect(result.customer.taxId).toBe('0105551234567');
    });

    it('rejects creating tax invoice for a voided sale', async () => {
      const mockSale = {
        id: 'sale-void',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        status: 'VOIDED',
      };

      const mockDb: any = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            sale: {
              findFirst: vi.fn().mockResolvedValue(mockSale),
            },
          });
        }),
      };

      const service = new TaxInvoiceService(mockDb);
      await expect(
        service.createTaxInvoice(mockPrincipalOwner, 'sale-void', {
          customerName: 'นายทดสอบ',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('prevents non-owner from updating branch tax settings', async () => {
      const mockDb: any = {};
      const service = new TaxInvoiceService(mockDb);

      await expect(
        service.updateBranchTaxSettings(mockPrincipalCashier, 'branch-1', {
          companyName: 'ชื่อใหม่',
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows owner to update branch tax settings', async () => {
      const mockUpdated = {
        id: 'branch-1',
        name: 'สาขาสุขุมวิท',
        companyName: 'บริษัท รับตังค์ จำกัด (มหาชน)',
        taxId: '0105559999999',
        taxAddress: '999 สุขุมวิท',
        branchNumber: '00001',
        isHeadOffice: false,
        phone: '02-999-9999',
        receiptHeader: 'ยินดีต้อนรับ',
        receiptFooter: 'ขอบคุณที่อุดหนุน',
      };

      const mockDb: any = {
        branch: {
          update: vi.fn().mockResolvedValue(mockUpdated),
        },
      };

      const service = new TaxInvoiceService(mockDb);
      const res = await service.updateBranchTaxSettings(mockPrincipalOwner, 'branch-1', {
        companyName: 'บริษัท รับตังค์ จำกัด (มหาชน)',
        taxId: '0105559999999',
        taxAddress: '999 สุขุมวิท',
        branchNumber: '00001',
        isHeadOffice: false,
        phone: '02-999-9999',
        receiptHeader: 'ยินดีต้อนรับ',
        receiptFooter: 'ขอบคุณที่อุดหนุน',
      });

      expect(res.companyName).toBe('บริษัท รับตังค์ จำกัด (มหาชน)');
      expect(res.branchNumber).toBe('00001');
      expect(res.isHeadOffice).toBe(false);
    });
  });
});
