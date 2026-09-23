import { describe, expect, it, vi } from 'vitest';
import { RefundService } from '../src/refund';
import { Principal } from '../src/auth';
import { Prisma } from '@prisma/client';

// Use valid UUIDs for all test IDs
const IDS = {
  tenant: '00000000-0000-4000-a000-000000000001',
  branch: '00000000-0000-4000-a000-000000000002',
  owner: '00000000-0000-4000-a000-000000000003',
  cashier: '00000000-0000-4000-a000-000000000004',
  manager: '00000000-0000-4000-a000-000000000005',
  memberOwner: '00000000-0000-4000-a000-000000000006',
  memberCashier: '00000000-0000-4000-a000-000000000007',
  memberManager: '00000000-0000-4000-a000-000000000008',
  sale: '00000000-0000-4000-a000-000000000010',
  item1: '00000000-0000-4000-a000-000000000011',
  item2: '00000000-0000-4000-a000-000000000012',
  prod1: '00000000-0000-4000-a000-000000000013',
  prod2: '00000000-0000-4000-a000-000000000014',
  cust: '00000000-0000-4000-a000-000000000015',
};

describe('RefundService (Partial Returns & Item-level Refunds)', () => {
  const ownerPrincipal: Principal = {
    userId: IDS.owner,
    tenantId: IDS.tenant,
    membershipId: IDS.memberOwner,
    branchIds: [IDS.branch],
    role: 'OWNER',
  };

  const cashierPrincipal: Principal = {
    userId: IDS.cashier,
    tenantId: IDS.tenant,
    membershipId: IDS.memberCashier,
    branchIds: [IDS.branch],
    role: 'CASHIER',
  };

  const managerPrincipal: Principal = {
    userId: IDS.manager,
    tenantId: IDS.tenant,
    membershipId: IDS.memberManager,
    branchIds: [IDS.branch],
    role: 'MANAGER',
  };

  const createMockSale = (overrides: any = {}) => ({
    id: IDS.sale,
    tenantId: IDS.tenant,
    branchId: IDS.branch,
    receiptNumber: 'REC-260923-ABC123',
    status: 'COMPLETED',
    subtotal: new Prisma.Decimal(500),
    discount: new Prisma.Decimal(50),
    total: new Prisma.Decimal(450),
    pointsEarned: 45,
    pointsRedeemed: 0,
    paymentMethod: 'CASH',
    branch: { id: IDS.branch, name: 'สาขาสุขุมวิท' },
    customer: { id: IDS.cust, name: 'คุณสมชาย', phone: '0812345678', points: 100, lifetimePoints: 500 },
    items: [
      {
        id: IDS.item1,
        saleId: IDS.sale,
        productId: IDS.prod1,
        name: 'กาแฟอเมริกาโน่',
        sku: 'COFFEE-001',
        price: new Prisma.Decimal(100),
        quantity: new Prisma.Decimal(2),
        returnedQuantity: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(200),
        product: { id: IDS.prod1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
      },
      {
        id: IDS.item2,
        saleId: IDS.sale,
        productId: IDS.prod2,
        name: 'ครัวซองต์เนย',
        sku: 'BREAD-001',
        price: new Prisma.Decimal(150),
        quantity: new Prisma.Decimal(2),
        returnedQuantity: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(300),
        product: { id: IDS.prod2, name: 'ครัวซองต์เนย', sku: 'BREAD-001' },
      },
    ],
    ...overrides,
  });

  it('returns returnable items with remaining quantities for a completed sale', async () => {
    const sale = createMockSale();
    const mockPrisma = {
      sale: { findFirst: vi.fn().mockResolvedValue(sale) },
    } as any;

    const service = new RefundService(mockPrisma);
    const result = await service.getReturnableItems(ownerPrincipal, IDS.sale);

    expect(result.sale.id).toBe(IDS.sale);
    expect(result.sale.receiptNumber).toBe('REC-260923-ABC123');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].remainingQuantity).toBe(2);
    expect(result.items[0].productName).toBe('กาแฟอเมริกาโน่');
    expect(result.items[1].remainingQuantity).toBe(2);
  });

  it('excludes fully returned items from returnable list', async () => {
    const sale = createMockSale({
      items: [
        { id: IDS.item1, saleId: IDS.sale, productId: IDS.prod1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', price: new Prisma.Decimal(100), quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(2), subtotal: new Prisma.Decimal(200), product: { id: IDS.prod1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' } },
        { id: IDS.item2, saleId: IDS.sale, productId: IDS.prod2, name: 'ครัวซองต์เนย', sku: 'BREAD-001', price: new Prisma.Decimal(150), quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(1), subtotal: new Prisma.Decimal(300), product: { id: IDS.prod2, name: 'ครัวซองต์เนย', sku: 'BREAD-001' } },
      ],
    });

    const mockPrisma = { sale: { findFirst: vi.fn().mockResolvedValue(sale) } } as any;
    const service = new RefundService(mockPrisma);
    const result = await service.getReturnableItems(ownerPrincipal, IDS.sale);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].productName).toBe('ครัวซองต์เนย');
    expect(result.items[0].remainingQuantity).toBe(1);
  });

  it('rejects voided sale from returning items', async () => {
    const sale = createMockSale({ status: 'VOIDED' });
    const mockPrisma = { sale: { findFirst: vi.fn().mockResolvedValue(sale) } } as any;

    const service = new RefundService(mockPrisma);
    await expect(service.getReturnableItems(ownerPrincipal, IDS.sale)).rejects.toThrow('ถูกยกเลิก');
  });

  it('blocks CASHIER from creating a return', async () => {
    const mockPrisma = {} as any;
    const service = new RefundService(mockPrisma);

    await expect(service.createReturn(cashierPrincipal, IDS.sale, {
      refundMethod: 'CASH',
      reason: 'สินค้าชำรุด',
      items: [{ saleItemId: IDS.item1, quantity: '1' }],
    })).rejects.toThrow('Manager');
  });

  it('creates a partial return with correct restocking via transaction', async () => {
    const sale = createMockSale();
    const createdReturn = {
      id: '00000000-0000-4000-a000-000000000020',
      returnNumber: 'CN-260923-XYZ789',
      refundMethod: 'CASH',
      subtotalRefund: new Prisma.Decimal(90),
      vatRefund: new Prisma.Decimal(5.89),
      totalRefund: new Prisma.Decimal(90),
      pointsDeducted: 9,
      reason: 'สินค้ามีตำหนิ',
      items: [{
        id: '00000000-0000-4000-a000-000000000021',
        saleItemId: IDS.item1, productId: IDS.prod1,
        quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(10), refundAmount: new Prisma.Decimal(90),
        restock: true, condition: 'RESTOCKABLE', note: null,
        product: { id: IDS.prod1, name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
      }],
      createdAt: new Date(),
    };

    const updatedItems = [
      { id: IDS.item1, quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(1) },
      { id: IDS.item2, quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(0) },
    ];

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn({
        sale: { findFirst: vi.fn().mockResolvedValue(sale), update: vi.fn().mockResolvedValue({}) },
        saleItem: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue(updatedItems) },
        inventoryBalance: { findUnique: vi.fn().mockResolvedValue({ quantity: new Prisma.Decimal(10) }), upsert: vi.fn().mockResolvedValue({}) },
        stockMovement: { create: vi.fn().mockResolvedValue({}) },
        customer: { update: vi.fn().mockResolvedValue({}) },
        pointLedger: { create: vi.fn().mockResolvedValue({}) },
        saleReturn: { create: vi.fn().mockResolvedValue(createdReturn) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      })),
    } as any;

    const service = new RefundService(mockPrisma);
    const result = await service.createReturn(ownerPrincipal, IDS.sale, {
      refundMethod: 'CASH',
      reason: 'สินค้ามีตำหนิ',
      items: [{ saleItemId: IDS.item1, quantity: '1', restock: true, condition: 'RESTOCKABLE' }],
    });

    expect(result.returnNumber).toBe('CN-260923-XYZ789');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].restock).toBe(true);
    expect(result.allFullyReturned).toBe(false);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('prevents returning more items than remaining quantity', async () => {
    const sale = createMockSale({
      items: [{
        id: IDS.item1, saleId: IDS.sale, productId: IDS.prod1,
        name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001',
        price: new Prisma.Decimal(100), quantity: new Prisma.Decimal(2),
        returnedQuantity: new Prisma.Decimal(2), subtotal: new Prisma.Decimal(200),
      }],
    });

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn({
        sale: { findFirst: vi.fn().mockResolvedValue(sale) },
      })),
    } as any;

    const service = new RefundService(mockPrisma);
    await expect(service.createReturn(managerPrincipal, IDS.sale, {
      refundMethod: 'CASH',
      reason: 'ผิดขนาด',
      items: [{ saleItemId: IDS.item1, quantity: '1' }],
    })).rejects.toThrow('เกินจำนวน');
  });

  it('allows MANAGER role to create a return without customer', async () => {
    const sale = createMockSale({ customer: null, pointsEarned: 0 });
    const createdReturn = {
      id: '00000000-0000-4000-a000-000000000030',
      returnNumber: 'CN-260923-MGR001',
      refundMethod: 'TRANSFER',
      subtotalRefund: new Prisma.Decimal(135), vatRefund: new Prisma.Decimal(8.83),
      totalRefund: new Prisma.Decimal(135), pointsDeducted: 0,
      reason: 'ลูกค้าเปลี่ยนใจ',
      items: [{
        id: '00000000-0000-4000-a000-000000000031',
        saleItemId: IDS.item2, productId: IDS.prod2,
        quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(150),
        discount: new Prisma.Decimal(15), refundAmount: new Prisma.Decimal(135),
        restock: false, condition: 'DAMAGED', note: 'สินค้าชำรุด ทิ้ง',
        product: { id: IDS.prod2, name: 'ครัวซองต์เนย', sku: 'BREAD-001' },
      }],
      createdAt: new Date(),
    };

    const updatedItems = [
      { id: IDS.item1, quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(0) },
      { id: IDS.item2, quantity: new Prisma.Decimal(2), returnedQuantity: new Prisma.Decimal(1) },
    ];

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => fn({
        sale: { findFirst: vi.fn().mockResolvedValue(sale), update: vi.fn().mockResolvedValue({}) },
        saleItem: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue(updatedItems) },
        saleReturn: { create: vi.fn().mockResolvedValue(createdReturn) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      })),
    } as any;

    const service = new RefundService(mockPrisma);
    const result = await service.createReturn(managerPrincipal, IDS.sale, {
      refundMethod: 'TRANSFER',
      reason: 'ลูกค้าเปลี่ยนใจ',
      items: [{ saleItemId: IDS.item2, quantity: '1', restock: false, condition: 'DAMAGED', note: 'สินค้าชำรุด ทิ้ง' }],
    });

    expect(result.returnNumber).toBe('CN-260923-MGR001');
    expect(result.items[0].restock).toBe(false);
    expect(result.items[0].condition).toBe('DAMAGED');
    expect(result.allFullyReturned).toBe(false);
  });
});
