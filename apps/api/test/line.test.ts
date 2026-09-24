import { describe, expect, it, vi } from 'vitest';
import { LineService } from '../src/line';
import { Principal } from '../src/auth';

describe('LineService (LINE Official Account & E-Receipt)', () => {
  const ownerPrincipal: Principal = {
    userId: 'user-owner-1',
    tenantId: 'tenant-1',
    branchIds: ['branch-1'],
    role: 'OWNER',
  };

  const cashierPrincipal: Principal = {
    userId: 'user-cashier-1',
    tenantId: 'tenant-1',
    branchIds: ['branch-1'],
    role: 'CASHIER',
  };

  it('builds a valid LINE Flex Message E-Receipt structure with all required fields', () => {
    const mockPrisma = {} as any;
    const service = new LineService(mockPrisma);

    const mockSale = {
      id: 'sale-123',
      receiptNumber: 'REC-260923-0001',
      createdAt: new Date('2026-09-23T10:00:00Z'),
      subtotal: 100,
      discount: 10,
      total: 90,
      paymentMethod: 'CASH',
      pointsEarned: 9,
      branch: { name: 'สาขาสุขุมวิท' },
      items: [
        { name: 'กาแฟอเมริกาโน่', quantity: 1, subtotal: 60 },
        { name: 'ครัวซองต์เนยสด', quantity: 1, subtotal: 40 },
      ],
    };

    const mockTenant = { name: 'ร้านรับตังค์ รีเทล' };
    const mockCustomer = { name: 'คุณสมชาย ใจดี', points: 150 };

    const flex = service.buildFlexReceipt(mockSale, mockTenant, mockCustomer);

    expect(flex.type).toBe('flex');
    expect(flex.altText).toContain('REC-260923-0001');
    expect(flex.contents.type).toBe('bubble');
    expect(flex.contents.header.backgroundColor).toBe('#06C755'); // Authentic LINE green
    expect(flex.contents.header.contents[1].text).toBe('ร้านรับตังค์ รีเทล');

    // Body checks
    const bodyContents = flex.contents.body.contents;
    expect(bodyContents.length).toBeGreaterThan(0);

    // Items present
    const itemsBox = bodyContents.find((c: any) => c.type === 'box' && Array.isArray(c.contents) && c.contents.length === 2);
    expect(itemsBox).toBeDefined();

    // Footer button present
    expect(flex.contents.footer.contents[0].action.uri).toContain('sale-123');
  });

  it('returns default unconfigured settings when no settings exist', async () => {
    const mockPrisma = {
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'รับตังค์คาเฟ่' }),
      },
    } as any;

    const service = new LineService(mockPrisma);
    const settings = await service.getSettings(ownerPrincipal);

    expect(settings.isConfigured).toBe(false);
    expect(settings.accountName).toContain('รับตังค์คาเฟ่');
    expect(settings.autoSendReceipt).toBe(true);
  });

  it('updates settings and creates audit log', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({
      id: 'settings-1',
      tenantId: 'tenant-1',
      accountName: '@rubtang_cafe',
      basicId: '@rubtang',
      channelAccessToken: 'mock_channel_access_token_12345678',
      autoSendReceipt: true,
      active: true,
    });
    const mockAuditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });

    const mockPrisma = {
      lineOaSettings: { upsert: mockUpsert },
      auditLog: { create: mockAuditCreate },
    } as any;

    const service = new LineService(mockPrisma);
    const res = await service.updateSettings(ownerPrincipal, {
      accountName: '@rubtang_cafe',
      basicId: '@rubtang',
      channelAccessToken: 'mock_channel_access_token_12345678',
      autoSendReceipt: true,
    });

    expect(res.isConfigured).toBe(true);
    expect(res.accountName).toBe('@rubtang_cafe');
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LINE_SETTINGS_UPDATED',
          tenantId: 'tenant-1',
        }),
      })
    );
  });

  it('forbids cashier from updating LINE OA settings', async () => {
    const mockPrisma = {} as any;
    const service = new LineService(mockPrisma);

    await expect(
      service.updateSettings(cashierPrincipal, { accountName: 'Hacked' })
    ).rejects.toThrow('ไม่มีสิทธิ์');
  });

  it('tests connection successfully in mock mode', async () => {
    const mockPrisma = {
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue({
          channelAccessToken: 'mock_token_abc',
          accountName: 'ร้านรับตังค์ LINE',
          basicId: '@rubtang',
        }),
      },
    } as any;

    const service = new LineService(mockPrisma);
    const testRes = await service.testConnection(ownerPrincipal);

    expect(testRes.connected).toBe(true);
    expect(testRes.message).toContain('สำเร็จ');
  });

  it('links and unlinks customer LINE account', async () => {
    const mockCustomer = {
      id: 'cust-1',
      tenantId: 'tenant-1',
      name: 'คุณสมศรี',
      phone: '0891234567',
      lineUserId: null,
    };

    const mockPrisma = {
      customer: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockCustomer) // for link check customer exists
          .mockResolvedValueOnce(null) // for link duplicate check
          .mockResolvedValueOnce({ ...mockCustomer, lineUserId: 'U12345678' }), // for unlink
        update: vi.fn()
          .mockResolvedValueOnce({ ...mockCustomer, lineUserId: 'U12345678', lineDisplayName: 'Somsri L.' })
          .mockResolvedValueOnce({ ...mockCustomer, lineUserId: null }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as any;

    const service = new LineService(mockPrisma);

    // Link
    const linked = await service.linkCustomer(ownerPrincipal, 'cust-1', {
      lineUserId: 'U12345678',
      lineDisplayName: 'Somsri L.',
    });
    expect(linked.lineUserId).toBe('U12345678');

    // Unlink
    const unlinked = await service.unlinkCustomer(ownerPrincipal, 'cust-1');
    expect(unlinked.lineUserId).toBeNull();
  });

  it('sends E-Receipt and records LineReceiptLog', async () => {
    const mockSale = {
      id: 'sale-1',
      tenantId: 'tenant-1',
      receiptNumber: 'REC-260923-0001',
      createdAt: new Date(),
      subtotal: 150,
      discount: 0,
      total: 150,
      paymentMethod: 'CASH',
      customerId: 'cust-1',
      branch: { name: 'สาขาหลัก' },
      items: [{ name: 'สินค้า A', quantity: 1, subtotal: 150 }],
      customer: { id: 'cust-1', name: 'คุณวิชัย', lineUserId: 'U987654321', points: 20 },
    };

    const mockCreateLog = vi.fn().mockResolvedValue({
      id: 'log-1',
      saleId: 'sale-1',
      lineUserId: 'U987654321',
      receiptNumber: 'REC-260923-0001',
      status: 'SENT',
    });

    const mockPrisma = {
      sale: { findFirst: vi.fn().mockResolvedValue(mockSale) },
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'รับตังค์' }) },
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue({
          channelAccessToken: 'mock_token',
        }),
      },
      lineReceiptLog: { create: mockCreateLog },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as any;

    const service = new LineService(mockPrisma);
    const result = await service.sendReceipt(ownerPrincipal, 'sale-1');

    expect(result.success).toBe(true);
    expect(result.status).toBe('SENT');
    expect(result.receiptNumber).toBe('REC-260923-0001');
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          saleId: 'sale-1',
          lineUserId: 'U987654321',
          status: 'SENT',
        }),
      })
    );
  });

  it('builds a valid LINE Flex Low Stock Alert structure', () => {
    const mockPrisma = {} as any;
    const service = new LineService(mockPrisma);

    const items = [
      { productId: 'p-1', name: 'เมล็ดกาแฟ', sku: 'COFFEE-01', quantity: 2, reorderPoint: 5 },
      { productId: 'p-2', name: 'นมสด', sku: 'MILK-01', quantity: 0, reorderPoint: 10 },
    ];

    const flex = service.buildFlexLowStockAlert(items, 'สาขาเอกมัย', 5, 'ร้านรับตังค์ คาเฟ่');

    expect(flex.type).toBe('flex');
    expect(flex.altText).toContain('แจ้งเตือนสินค้าใกล้หมด 2 รายการ');
    expect(flex.contents.header.backgroundColor).toBe('#dc2626');
    expect(flex.contents.header.contents[1].text).toBe('ร้านรับตังค์ คาเฟ่');
    expect(flex.contents.body.contents.length).toBeGreaterThan(0);
    expect(flex.contents.footer.contents[0].action.uri).toContain('/inventory');
  });

  it('gets low stock items and generates preview', async () => {
    const mockPrisma = {
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue({
          lowStockAlertEnabled: true,
          lowStockThreshold: 5,
          lowStockTargetUserId: 'U_manager_123',
        }),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ name: 'ร้านกาแฟหอม' }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ name: 'สาขาทองหล่อ' }),
      },
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            branchId: 'b-1',
            quantity: 3,
            branch: { name: 'สาขาทองหล่อ' },
            product: { id: 'p-1', name: 'ชาเขียว', sku: 'TEA-01', reorderPoint: 5, price: 45 },
          },
          {
            branchId: 'b-1',
            quantity: 12,
            branch: { name: 'สาขาทองหล่อ' },
            product: { id: 'p-2', name: 'ชาไทย', sku: 'TEA-02', reorderPoint: 5, price: 40 },
          },
        ]),
      },
    } as any;

    const service = new LineService(mockPrisma);
    const preview = await service.getLowStockPreview(ownerPrincipal, 'b-1');

    expect(preview.totalCount).toBe(1);
    expect(preview.items[0].name).toBe('ชาเขียว');
    expect(preview.items[0].quantity).toBe(3);
    expect(preview.flexMessage).toBeDefined();
    expect(preview.flexMessage.contents.header.contents[1].text).toBe('ร้านกาแฟหอม');
  });

  it('sends low stock alert via LINE OA push message', async () => {
    const mockPrisma = {
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue({
          channelAccessToken: 'mock_token',
          lowStockThreshold: 5,
          lowStockTargetUserId: 'U_target_manager',
        }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ name: 'ร้านทดสอบ' }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ name: 'สาขาหลัก' }),
      },
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            branchId: 'b-1',
            quantity: 1,
            branch: { name: 'สาขาหลัก' },
            product: { id: 'p-1', name: 'สินค้าขาดแคลน', sku: 'SHORT-01', reorderPoint: 5 },
          },
        ]),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as any;

    const service = new LineService(mockPrisma);
    const result = await service.sendLowStockAlert(ownerPrincipal, { branchId: 'b-1' });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.targetUserId).toBe('U_target_manager');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LINE_LOW_STOCK_ALERT_SENT',
          tenantId: 'tenant-1',
        }),
      })
    );
  });

  it('handles zero low stock items gracefully when sending alert', async () => {
    const mockPrisma = {
      lineOaSettings: {
        findUnique: vi.fn().mockResolvedValue({
          lowStockThreshold: 5,
        }),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ name: 'ร้านทดสอบ' }),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ name: 'สาขาหลัก' }),
      },
      inventoryBalance: {
        findMany: vi.fn().mockResolvedValue([
          {
            branchId: 'b-1',
            quantity: 50,
            branch: { name: 'สาขาหลัก' },
            product: { id: 'p-1', name: 'สินค้าล้นสต็อก', sku: 'OVER-01', reorderPoint: 5 },
          },
        ]),
      },
    } as any;

    const service = new LineService(mockPrisma);
    const result = await service.sendLowStockAlert(ownerPrincipal, { branchId: 'b-1' });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.message).toContain('ไม่มีรายการสินค้าที่สต็อกต่ำกว่าเกณฑ์');
  });
});
