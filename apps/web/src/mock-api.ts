import { ApiError, AuditLogItem, AuditLogListResponse, AuditLogMetrics, BranchPromptPay, BranchTaxSettings, Customer, LineOaSettings, LineReceiptLog, LoyaltyReward, PointLedgerItem, Product, Profile, ReturnableItem, ReturnableSaleInfo, SaleHistoryItem, SaleReturn, SaleReturnItem, SaleReturnListItem, StockTakeDetail, StockTakeItem, StockTakeStatus, StockTakeSummary, TaxInvoice } from './api';
import { bahtText, calculateVat } from './baht-text';
import { generatePromptPayPayload } from './promptpay-engine';

type Movement = {
  id: string; type: 'RECEIVE' | 'ADJUSTMENT' | 'RETURN'; quantity: string; balanceBefore: string; balanceAfter: string;
  note: string; createdAt: string; product: { name: string; sku: string }; actor: { user: { displayName: string } };
};

const profile: Profile = {
  user: { id: 'demo-user', email: 'owner@rubtang.demo', displayName: 'เจ้าของร้านเดโม' },
  tenant: { id: 'demo-tenant', name: 'ร้านรับตังค์เดโม' },
  branches: [{ id: 'demo-sukhumvit', name: 'สาขาสุขุมวิท' }, { id: 'demo-siam', name: 'สาขาสยาม' }],
  role: 'OWNER',
};

let signedIn = true;
let productSequence = 4;
const products: Product[] = [
  { id: 'demo-product-1', name: 'น้ำดื่ม 600 มล.', sku: 'DRINK-001', barcode: '885000000001', price: '10.00', quantity: '42', active: true },
  { id: 'demo-product-2', name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', barcode: '885000000002', price: '55.00', quantity: '18', active: true },
  { id: 'demo-product-3', name: 'ถุงกระดาษ', sku: 'PACK-001', barcode: null, price: '3.00', quantity: '120', active: true },
];
const customers: Customer[] = [
  { id: 'demo-cust-1', name: 'คุณสมชาย ใจดี', phone: '0812345678', points: 120, lifetimePoints: 450, tier: 'SILVER', note: 'ลูกค้าประจำ ชอบกาแฟไม่หวาน', lineUserId: 'U_demo_somchai', lineDisplayName: 'Somchai Jaidee', linePictureUrl: null, lineLinkedAt: new Date(Date.now() - 7 * 86400000).toISOString(), createdAt: new Date().toISOString() },
  { id: 'demo-cust-2', name: 'คุณวิภา วงศ์สว่าง', phone: '0899887766', points: 45, lifetimePoints: 95, tier: 'BRONZE', note: null, lineUserId: null, lineDisplayName: null, linePictureUrl: null, lineLinkedAt: null, createdAt: new Date().toISOString() },
];

const mockPointLedgers: Record<string, PointLedgerItem[]> = {
  'demo-cust-1': [
    {
      id: 'pl-1',
      type: 'EARN',
      amount: 20,
      balanceAfter: 120,
      reason: 'สะสมแต้มจากบิล REC-260923-0101',
      saleReceiptNumber: 'REC-260923-0101',
      actorName: 'เจ้าของร้านเดโม',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'pl-2',
      type: 'REDEEM',
      amount: -50,
      balanceAfter: 100,
      reason: 'ใช้แลกส่วนลดบิล REC-260922-0055',
      saleReceiptNumber: 'REC-260922-0055',
      actorName: 'เจ้าของร้านเดโม',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
  'demo-cust-2': [
    {
      id: 'pl-3',
      type: 'EARN',
      amount: 45,
      balanceAfter: 45,
      reason: 'สะสมแต้มจากบิล REC-260921-0020',
      saleReceiptNumber: 'REC-260921-0020',
      actorName: 'เจ้าของร้านเดโม',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ],
};

const mockLoyaltyRewards: LoyaltyReward[] = [
  {
    id: 'reward-demo-1',
    title: 'ส่วนลดเงินสด 50 บาท',
    pointsCost: 50,
    discountAmount: '50.00',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'reward-demo-2',
    title: 'ส่วนลดเงินสด 100 บาท',
    pointsCost: 100,
    discountAmount: '100.00',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'reward-demo-3',
    title: 'แก้วน้ำพรีเมียม RubTang Eco Cup',
    pointsCost: 200,
    discountAmount: '0.00',
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const sales: SaleHistoryItem[] = [
  {
    id: 'sale-demo-1',
    receiptNumber: 'REC-260923-0101',
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    branchName: 'สาขาสุขุมวิท',
    cashierName: 'เจ้าของร้านเดโม',
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
    customer: { id: 'demo-cust-1', name: 'คุณสมชาย ใจดี', phone: '0812345678' },
    subtotal: '120.00',
    discount: '12.00',
    total: '108.00',
    paymentMethod: 'CASH',
    items: [
      { id: 'sale-demo-1-item-1', productId: 'demo-product-2', name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', price: '55.00', quantity: '2', returnedQuantity: '0', subtotal: '110.00' },
      { id: 'sale-demo-1-item-2', productId: 'demo-product-1', name: 'น้ำดื่ม 600 มล.', sku: 'DRINK-001', price: '10.00', quantity: '1', returnedQuantity: '0', subtotal: '10.00' },
    ],
  },
];
const movements: Movement[] = [];

const mockReturns: SaleReturn[] = [
  {
    id: 'ret-demo-1',
    returnNumber: 'CN-260923-A8F192',
    saleId: 'sale-demo-past-1',
    receiptNumber: 'REC-260922-0050',
    branch: { id: 'demo-sukhumvit', name: 'สาขาสุขุมวิท' },
    customer: { id: 'demo-cust-1', name: 'คุณสมชาย ใจดี', phone: '0812345678' },
    refundMethod: 'CASH',
    subtotalRefund: 55,
    vatRefund: 3.6,
    totalRefund: 55,
    pointsDeducted: 1,
    reason: 'ลูกค้าเปลี่ยนใจ สินค้ายังไม่เปิดใช้งาน',
    items: [
      {
        id: 'ret-item-demo-1',
        productName: 'กาแฟอเมริกาโน่',
        sku: 'COFFEE-001',
        quantity: 1,
        unitPrice: 55,
        discount: 0,
        refundAmount: 55,
        restock: true,
        condition: 'RESTOCKABLE',
        note: 'สภาพสมบูรณ์',
      },
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    allFullyReturned: false,
  },
];



function stringValue(value: unknown) { return typeof value === 'string' ? value : ''; }
function productFor(id: string) {
  const product = products.find(item => item.id === id);
  if (!product) throw new ApiError(404, 'ไม่พบสินค้า');
  return product;
}

/** In-memory development data. It is intentionally excluded from production builds. */
export async function mockApi<T>(path: string, body?: unknown): Promise<T> {
  const [pathname, queryString = ''] = path.split('?');
  const query = new URLSearchParams(queryString);
  const input = (body ?? {}) as Record<string, unknown>;

  if (pathname === '/auth/me') {
    if (!signedIn) throw new ApiError(401, 'กรุณาเข้าสู่ระบบ');
    return profile as T;
  }
  if (pathname === '/auth/login' || pathname === '/auth/register') {
    signedIn = true;
    return profile as T;
  }
  if (pathname === '/auth/logout') {
    signedIn = false;
    return {} as T;
  }
  if (!signedIn) throw new ApiError(401, 'กรุณาเข้าสู่ระบบ');

  if (pathname === '/products' && body === undefined) {
    const term = (query.get('search') ?? '').trim().toLowerCase();
    return products.filter(item => !term || [item.name, item.sku, item.barcode ?? ''].some(value => value.toLowerCase().includes(term))) as T;
  }
  if (pathname === '/products') {
    const product: Product = {
      id: `demo-product-${productSequence++}`, name: stringValue(input.name), sku: stringValue(input.sku),
      barcode: stringValue(input.barcode) || null, price: Number(stringValue(input.price)).toFixed(2), quantity: '0', active: true,
    };
    products.unshift(product);
    return product as T;
  }
  if (pathname.startsWith('/products/')) {
    const product = productFor(pathname.slice('/products/'.length));
    product.name = stringValue(input.name);
    product.sku = stringValue(input.sku);
    product.barcode = stringValue(input.barcode) || null;
    product.price = Number(stringValue(input.price)).toFixed(2);
    product.active = input.active === true;
    return product as T;
  }
  if (pathname === '/inventory/movements' && body === undefined) {
    return { items: movements, nextCursor: null } as T;
  }
  if (pathname === '/inventory/movements') {
    const product = productFor(stringValue(input.productId));
    const delta = Number(stringValue(input.quantity));
    const before = Number(product.quantity);
    const after = before + delta;
    if (!Number.isFinite(delta) || delta === 0 || after < 0) throw new ApiError(400, 'จำนวนสต็อกไม่ถูกต้อง');
    product.quantity = String(after);
    const movement: Movement = {
      id: crypto.randomUUID(), type: input.type === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'RECEIVE', quantity: String(delta),
      balanceBefore: String(before), balanceAfter: String(after), note: stringValue(input.note), createdAt: new Date().toISOString(),
      product: { name: product.name, sku: product.sku }, actor: { user: { displayName: profile.user.displayName } },
    };
    movements.unshift(movement);
    return movement as T;
  }
  if (pathname === '/branches' && body === undefined) {
    return profile.branches as T;
  }
  if (pathname === '/branches') {
    const newBranch = { id: `branch-${Date.now()}`, name: stringValue(input.name) };
    profile.branches.push(newBranch);
    return newBranch as T;
  }
  if (pathname === '/staff' && body === undefined) {
    return [
      { id: 'member-owner', userId: profile.user.id, displayName: profile.user.displayName, email: profile.user.email, role: 'OWNER', branches: profile.branches },
    ] as T;
  }
  if (pathname === '/staff') {
    const staffId = `staff-${Date.now()}`;
    const assignedBranches = profile.branches.filter(b => Array.isArray(input.branchIds) && input.branchIds.includes(b.id));
    return {
      id: staffId,
      userId: `user-${Date.now()}`,
      displayName: stringValue(input.displayName),
      email: stringValue(input.email),
      role: input.role === 'MANAGER' ? 'MANAGER' : 'CASHIER',
      branches: assignedBranches,
    } as T;
  }
  if (pathname === '/customers' && body === undefined) {
    const term = (query.get('search') ?? '').trim().toLowerCase();
    return customers.filter(c => !term || [c.name, c.phone].some(v => v.toLowerCase().includes(term))) as T;
  }
  if (pathname === '/customers') {
    const name = stringValue(input.name).trim();
    const phone = stringValue(input.phone).trim();
    const note = stringValue(input.note).trim() || null;
    if (!name || !phone) throw new ApiError(400, 'กรุณาระบุชื่อและเบอร์โทรศัพท์');
    if (customers.some(c => c.phone === phone)) {
      throw new ApiError(409, 'เบอร์โทรศัพท์นี้ถูกลงทะเบียนไว้แล้วในระบบ');
    }
    const customer: Customer = {
      id: `cust-${Date.now()}`,
      name,
      phone,
      points: 0,
      note,
      createdAt: new Date().toISOString(),
    };
    customers.unshift(customer);
    return customer as T;
  }
  if (pathname === '/checkout') {
    const rawItems = (Array.isArray(input.items) ? input.items : []) as { productId: string; quantity: number }[];
    const receiptItems = rawItems.map(item => {
      const prod = productFor(item.productId);
      const qty = item.quantity;
      prod.quantity = String(Math.max(0, Number(prod.quantity) - qty));
      const lineSub = Number(prod.price) * qty;
      return {
        id: `item-${Date.now()}-${prod.id}`,
        productId: prod.id,
        name: prod.name,
        sku: prod.sku,
        price: prod.price,
        quantity: String(qty),
        returnedQuantity: '0',
        subtotal: lineSub.toFixed(2),
      };
    });
    const subtotal = receiptItems.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const discount = Math.min(Number(input.discount) || 0, subtotal);
    const redeemPoints = Number(input.redeemPoints) || 0;
    const pointsDiscount = Math.min(redeemPoints, subtotal - discount);
    const total = subtotal - discount - pointsDiscount;
    const paymentMethod = input.paymentMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH';
    const receivedAmount = Number(input.receivedAmount) || total;
    const change = Math.max(0, receivedAmount - total);

    let customerInfo: { id: string; name: string; phone: string; pointsEarned: number; pointsRedeemed: number } | null = null;
    if (typeof input.customerId === 'string' && input.customerId) {
      const cust = customers.find(c => c.id === input.customerId);
      if (cust) {
        if (redeemPoints > 0) {
          cust.points = Math.max(0, cust.points - redeemPoints);
          if (!mockPointLedgers[cust.id]) mockPointLedgers[cust.id] = [];
          mockPointLedgers[cust.id].unshift({
            id: `pl-${Date.now()}-r`,
            type: 'REDEEM',
            amount: -redeemPoints,
            balanceAfter: cust.points,
            reason: `ใช้แลกส่วนลดบิล`,
            actorName: profile.user.displayName,
            createdAt: new Date().toISOString(),
          });
        }
        const pointsEarned = Math.floor(total / 50);
        cust.points += pointsEarned;
        cust.lifetimePoints = (cust.lifetimePoints || 0) + pointsEarned;
        if (pointsEarned > 0) {
          if (!mockPointLedgers[cust.id]) mockPointLedgers[cust.id] = [];
          mockPointLedgers[cust.id].unshift({
            id: `pl-${Date.now()}-e`,
            type: 'EARN',
            amount: pointsEarned,
            balanceAfter: cust.points,
            reason: `สะสมแต้มจากบิล`,
            actorName: profile.user.displayName,
            createdAt: new Date().toISOString(),
          });
        }
        customerInfo = {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          pointsEarned,
          pointsRedeemed: redeemPoints,
        };
      }
    }

    const saleRecord: SaleHistoryItem = {
      id: `sale-${Date.now()}`,
      receiptNumber: `REC-${String(Date.now()).slice(-6)}`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      branchName: profile.branches[0]?.name ?? 'สาขาหลัก',
      cashierName: profile.user.displayName,
      voidedAt: null,
      voidedByName: null,
      voidReason: null,
      customer: customerInfo ? { id: customerInfo.id, name: customerInfo.name, phone: customerInfo.phone } : null,
      subtotal: subtotal.toFixed(2),
      discount: (discount + pointsDiscount).toFixed(2),
      total: total.toFixed(2),
      paymentMethod,
      items: receiptItems,
    };
    sales.unshift(saleRecord);

    return {
      id: saleRecord.id,
      receiptNumber: saleRecord.receiptNumber,
      createdAt: saleRecord.createdAt,
      branch: profile.branches[0] ?? { id: 'b1', name: 'สาขาหลัก' },
      cashier: { displayName: profile.user.displayName },
      customer: customerInfo,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
      paymentMethod,
      receivedAmount: receivedAmount.toFixed(2),
      change: change.toFixed(2),
      items: receiptItems,
    } as T;
  }
  if (pathname === '/sales' && body === undefined) {
    return sales as T;
  }
  if (pathname.startsWith('/sales/') && pathname.endsWith('/void')) {
    const saleId = pathname.replace('/sales/', '').replace('/void', '');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new ApiError(404, 'ไม่พบรายการขาย');
    if (sale.status === 'VOIDED') throw new ApiError(409, 'รายการขายนี้ถูกยกเลิกไปแล้ว');
    const reason = stringValue(input.reason).trim();
    if (!reason || reason.length < 3) throw new ApiError(400, 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร');

    // Return stock
    for (const item of sale.items) {
      const prod = products.find(p => p.id === item.productId || p.name === item.name);
      if (prod) {
        prod.quantity = String(Number(prod.quantity) + Number(item.quantity));
      }
    }

    // Reverse customer points
    if (sale.customer) {
      const cust = customers.find(c => c.id === sale.customer?.id || c.phone === sale.customer?.phone);
      if (cust) {
        const pointsDeducted = Math.floor(Number(sale.total) / 50);
        cust.points = Math.max(0, cust.points - pointsDeducted);
      }
    }

    sale.status = 'VOIDED';
    sale.voidedAt = new Date().toISOString();
    sale.voidedByName = profile.user.displayName;
    sale.voidReason = reason;

    return sale as T;
  }
  if (pathname === '/dashboard') {
    const completedSales = sales.filter(s => s.status === 'COMPLETED');
    const todaySales = completedSales.reduce((acc, s) => acc + Number(s.total), 0);
    const todayBills = completedSales.length;
    const lowStock = products.filter(p => Number(p.quantity) <= 5).map(p => ({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      branchName: profile.branches[0]?.name ?? 'สาขาหลัก',
      quantity: Number(p.quantity),
    }));

    const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const now = new Date();
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailySales.push({
        date: d.toISOString().slice(0, 10),
        dayLabel: dayNames[d.getDay()],
        amount: i === 0 ? todaySales : Math.max(0, Math.round(todaySales * (0.6 + i * 0.08))),
      });
    }

    const topMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    completedSales.forEach(s => {
      s.items.forEach(it => {
        const cur = topMap.get(it.name) ?? { name: it.name, quantity: 0, revenue: 0 };
        cur.quantity += Number(it.quantity);
        cur.revenue += Number(it.subtotal);
        topMap.set(it.name, cur);
      });
    });

    const topProducts = Array.from(topMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((it, idx) => ({ productId: `top-${idx}`, ...it }));

    let cash = 0;
    let transfer = 0;
    completedSales.forEach(s => {
      if (s.paymentMethod === 'CASH') cash += Number(s.total);
      else transfer += Number(s.total);
    });

    return {
      metrics: {
        todaySales,
        todayBills,
        yesterdaySales: Math.round(todaySales * 0.85),
        monthSales: todaySales + 15400,
        monthBills: todayBills + 35,
        lowStockCount: lowStock.length,
      },
      dailySales,
      topProducts,
      lowStock,
      paymentBreakdown: {
        cash,
        transfer,
      },
      branchComparison: profile.branches.map(b => ({
        branchId: b.id,
        name: b.name,
        sales: Math.round(todaySales * 0.5 + 5000),
      })),
    } as T;
  }
  if (pathname === '/shifts/current') {
    if (!mockShift) return { shift: null } as T;
    return { shift: mockShift } as T;
  }
  if (pathname === '/shifts/open') {
    const input = body as { branchId: string; startingCash: string; note?: string };
    const startingCash = Number(input.startingCash) || 0;
    mockShift = {
      id: `shift-demo-${Date.now()}`,
      branchId: input.branchId,
      cashierId: 'demo-cashier',
      cashierName: profile.user.displayName,
      status: 'OPEN',
      startingCash,
      cashSales: 0,
      transferSales: 0,
      expectedCash: startingCash,
      salesCount: 0,
      notes: input.note || null,
      openedAt: new Date().toISOString(),
    };
    return mockShift as T;
  }
  if (pathname.startsWith('/shifts/') && pathname.endsWith('/close')) {
    if (!mockShift) throw new ApiError(404, 'ไม่พบกะงานที่เปิดอยู่');
    const input = body as { actualCash: string; note?: string };
    const actualCash = Number(input.actualCash) || 0;
    const difference = actualCash - mockShift.expectedCash;
    const closed = {
      ...mockShift,
      status: 'CLOSED' as const,
      actualCash,
      difference,
      closedAt: new Date().toISOString(),
      notes: input.note ? `${mockShift.notes ?? ''} ${input.note}`.trim() : mockShift.notes,
    };
    mockPastShifts.unshift(closed);
    mockShift = null;
    return closed as T;
  }
  if (pathname === '/shifts') {
    return mockPastShifts as T;
  }
  if (pathname === '/transfers') {
    return mockTransfers as T;
  }
  if (pathname === '/transfers' && body) {
    const input = body as { originBranchId: string; destinationBranchId: string; items: { productId: string; quantity: number }[]; note?: string };
    const originBranch = profile.branches.find(b => b.id === input.originBranchId) ?? profile.branches[0];
    const destinationBranch = profile.branches.find(b => b.id === input.destinationBranchId) ?? profile.branches[1] ?? profile.branches[0];
    const newTransfer: any = {
      id: `tr-demo-${Date.now()}`,
      transferNumber: `TR-260923-${String(mockTransfers.length + 1).padStart(4, '0')}`,
      originBranchId: input.originBranchId,
      destinationBranchId: input.destinationBranchId,
      status: 'IN_TRANSIT' as const,
      notes: input.note || null,
      createdAt: new Date().toISOString(),
      originBranch: { id: originBranch.id, name: originBranch.name },
      destinationBranch: { id: destinationBranch.id, name: destinationBranch.name },
      createdBy: { user: { displayName: profile.user.displayName } },
      items: input.items.map(it => {
        const prod = products.find(p => p.id === it.productId);
        return {
          id: `item-${Date.now()}-${it.productId}`,
          productId: it.productId,
          quantity: it.quantity,
          product: { id: it.productId, name: prod?.name ?? 'สินค้า', sku: prod?.sku ?? 'SKU' },
        };
      }),
    };
    mockTransfers.unshift(newTransfer);
    return newTransfer as T;
  }
  if (pathname.startsWith('/transfers/') && pathname.endsWith('/receive')) {
    const transferId = pathname.replace('/transfers/', '').replace('/receive', '');
    const tr = mockTransfers.find(t => t.id === transferId);
    if (!tr) throw new ApiError(404, 'ไม่พบรายการโอนสินค้า');
    tr.status = 'COMPLETED';
    tr.receivedAt = new Date().toISOString();
    tr.receivedBy = { user: { displayName: profile.user.displayName } };
    return tr as T;
  }
  if (pathname.startsWith('/transfers/') && pathname.endsWith('/cancel')) {
    const transferId = pathname.replace('/transfers/', '').replace('/cancel', '');
    const tr = mockTransfers.find(t => t.id === transferId);
    if (!tr) throw new ApiError(404, 'ไม่พบรายการโอนสินค้า');
    tr.status = 'CANCELLED';
    tr.cancelledAt = new Date().toISOString();
    return tr as T;
  }
  if (pathname === '/promotions') {
    return mockPromotions as T;
  }
  if (pathname === '/promotions' && body) {
    const input = body as any;
    const newPromo = {
      id: `promo-demo-${Date.now()}`,
      name: input.name,
      code: input.code ? input.code.toUpperCase() : null,
      discountType: input.discountType,
      discountValue: Number(input.discountValue),
      minSpend: Number(input.minSpend || 0),
      maxDiscount: input.maxDiscount ? Number(input.maxDiscount) : null,
      branchId: input.branchId || null,
      branchName: input.branchId ? (profile.branches.find(b => b.id === input.branchId)?.name ?? 'สาขา') : 'ทุกสาขา',
      active: true,
      createdAt: new Date().toISOString(),
    };
    mockPromotions.unshift(newPromo);
    return newPromo as T;
  }
  if (pathname.startsWith('/promotions/') && pathname !== '/promotions/validate') {
    const id = pathname.replace('/promotions/', '');
    const promo = mockPromotions.find(p => p.id === id);
    if (!promo) throw new ApiError(404, 'ไม่พบโปรโมชัน');
    const input = body as any;
    if (input.active !== undefined) promo.active = input.active;
    if (input.name !== undefined) promo.name = input.name;
    return promo as T;
  }
  if (pathname === '/promotions/validate') {
    const input = body as { code?: string; promotionId?: string; branchId: string; subtotal: string };
    const promo = mockPromotions.find(p =>
      (input.code ? p.code === input.code.toUpperCase() : p.id === input.promotionId) && p.active,
    );
    if (!promo) throw new ApiError(404, 'ไม่พบคูปองหรือโปรโมชันนี้');
    const sub = Number(input.subtotal);
    if (sub < promo.minSpend) throw new ApiError(400, `ยอดซื้อขั้นต่ำคือ ${promo.minSpend} บาท (ปัจจุบัน ${sub} บาท)`);
    let discountAmount = 0;
    if (promo.discountType === 'FIXED_AMOUNT') {
      discountAmount = Math.min(promo.discountValue, sub);
    } else {
      const raw = (sub * promo.discountValue) / 100;
      discountAmount = Math.min(raw, promo.maxDiscount ?? Infinity, sub);
    }
    return {
      valid: true,
      promotion: promo,
      subtotal: sub,
      discountAmount,
      finalTotal: sub - discountAmount,
    } as T;
  }

  // SUPPLIERS
  if (pathname === '/suppliers' && body === undefined) {
    const term = (query.get('search') ?? '').trim().toLowerCase();
    return mockSuppliers.filter(s =>
      !term || [s.name, s.contactName ?? '', s.phone ?? ''].some(v => v.toLowerCase().includes(term)),
    ) as T;
  }
  if (pathname === '/suppliers') {
    const input = body as any;
    const newSupp = {
      id: `supp-demo-${Date.now()}`,
      name: input.name,
      contactName: input.contactName || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      creditDays: Number(input.creditDays || 0),
      active: true,
      poCount: 0,
      createdAt: new Date().toISOString(),
    };
    mockSuppliers.unshift(newSupp);
    return newSupp as T;
  }
  if (pathname.startsWith('/suppliers/')) {
    const id = pathname.replace('/suppliers/', '');
    const supp = mockSuppliers.find(s => s.id === id);
    if (!supp) throw new ApiError(404, 'ไม่พบผู้จำหน่าย');
    const input = body as any;
    if (input.name !== undefined) supp.name = input.name;
    if (input.contactName !== undefined) supp.contactName = input.contactName;
    if (input.phone !== undefined) supp.phone = input.phone;
    if (input.email !== undefined) supp.email = input.email;
    if (input.address !== undefined) supp.address = input.address;
    if (input.creditDays !== undefined) supp.creditDays = Number(input.creditDays);
    if (input.active !== undefined) supp.active = input.active;
    return supp as T;
  }

  // PURCHASE ORDERS
  if (pathname === '/purchase-orders' && body === undefined) {
    const branchId = query.get('branchId');
    const status = query.get('status');
    const supplierId = query.get('supplierId');
    return mockPurchaseOrders.filter(po => {
      if (branchId && po.branchId !== branchId) return false;
      if (status && po.status !== status) return false;
      if (supplierId && po.supplierId !== supplierId) return false;
      return true;
    }) as T;
  }
  if (pathname.startsWith('/purchase-orders/') && pathname.endsWith('/receive')) {
    const id = pathname.replace('/purchase-orders/', '').replace('/receive', '');
    const po = mockPurchaseOrders.find(p => p.id === id);
    if (!po) throw new ApiError(404, 'ไม่พบใบสั่งซื้อ');
    const input = body as { items: { purchaseOrderItemId: string; receiveQuantity: string }[] };
    for (const item of input.items) {
      const poItem = po.items.find((i: any) => i.id === item.purchaseOrderItemId);
      if (poItem) {
        poItem.receivedQuantity += Number(item.receiveQuantity);
      }
    }
    po.totalReceivedQty = po.items.reduce((acc: number, i: any) => acc + i.receivedQuantity, 0);
    const allDone = po.items.every((i: any) => i.receivedQuantity >= i.orderedQuantity);
    po.status = allDone ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    po.receivedAt = new Date().toISOString();
    po.receivedByName = profile.user.displayName;
    return { id: po.id, poNumber: po.poNumber, status: po.status, receivedAt: po.receivedAt } as T;
  }
  if (pathname.startsWith('/purchase-orders/') && pathname.endsWith('/cancel')) {
    const id = pathname.replace('/purchase-orders/', '').replace('/cancel', '');
    const po = mockPurchaseOrders.find(p => p.id === id);
    if (!po) throw new ApiError(404, 'ไม่พบใบสั่งซื้อ');
    po.status = 'CANCELLED';
    po.cancelledAt = new Date().toISOString();
    return { id: po.id, poNumber: po.poNumber, status: po.status, cancelledAt: po.cancelledAt } as T;
  }
  if (pathname.startsWith('/purchase-orders/') && body === undefined) {
    const id = pathname.replace('/purchase-orders/', '');
    const po = mockPurchaseOrders.find(p => p.id === id);
    if (!po) throw new ApiError(404, 'ไม่พบใบสั่งซื้อ');
    return po as T;
  }
  if (pathname === '/purchase-orders') {
    const input = body as any;
    const supplier = mockSuppliers.find(s => s.id === input.supplierId) || { name: 'ผู้จำหน่าย' };
    const branch = profile.branches.find(b => b.id === input.branchId) || profile.branches[0];
    const items = input.items.map((it: any, idx: number) => {
      const prod = products.find(p => p.id === it.productId) || { name: 'สินค้า', sku: 'SKU' };
      const qty = Number(it.orderedQuantity);
      const cost = Number(it.unitCost);
      return {
        id: `po-item-${Date.now()}-${idx}`,
        productId: it.productId,
        productName: prod.name,
        sku: prod.sku,
        barcode: null,
        orderedQuantity: qty,
        receivedQuantity: 0,
        unitCost: cost,
        totalCost: qty * cost,
      };
    });
    const totalAmount = items.reduce((acc: number, i: any) => acc + i.totalCost, 0);
    const newPo = {
      id: `po-demo-${Date.now()}`,
      poNumber: `PO-260923-${String(mockPurchaseOrders.length + 1).padStart(4, '0')}`,
      status: 'ORDERED',
      supplierId: input.supplierId,
      supplierName: supplier.name,
      branchId: input.branchId,
      branchName: branch.name,
      createdByName: profile.user.displayName,
      receivedByName: null,
      totalAmount,
      itemCount: items.length,
      totalOrderedQty: items.reduce((acc: number, i: any) => acc + i.orderedQuantity, 0),
      totalReceivedQty: 0,
      note: input.note || null,
      orderedAt: new Date().toISOString(),
      receivedAt: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      items,
    };
    mockPurchaseOrders.unshift(newPo);
    return newPo as T;
  }

  // REPORTS
  if (pathname === '/reports/sales') {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0];

    const rows = [
      { date: twoDaysAgo, bills: 12, subtotal: 1540, discount: 50, netSales: 1490, cashSales: 890, transferSales: 600 },
      { date: yesterday, bills: 18, subtotal: 2450, discount: 120, netSales: 2330, cashSales: 1300, transferSales: 1030 },
      { date: today, bills: 8, subtotal: 1080, discount: 40, netSales: 1040, cashSales: 640, transferSales: 400 },
    ];

    const totalSales = rows.reduce((s, r) => s + r.netSales, 0);
    const totalBills = rows.reduce((s, r) => s + r.bills, 0);
    const totalDiscount = rows.reduce((s, r) => s + r.discount, 0);
    const totalCash = rows.reduce((s, r) => s + r.cashSales, 0);
    const totalTransfer = rows.reduce((s, r) => s + r.transferSales, 0);

    return {
      summary: {
        totalSales,
        totalBills,
        averageOrderValue: totalBills > 0 ? Math.round(totalSales / totalBills) : 0,
        totalDiscount,
        totalCash,
        totalTransfer,
      },
      rows,
    } as T;
  }

  if (pathname === '/reports/top-products') {
    return {
      totalRevenue: 4860,
      items: [
        { productId: 'demo-product-2', name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', quantitySold: 52, revenue: 2860, sharePercent: 58.8 },
        { productId: 'demo-product-1', name: 'น้ำดื่ม 600 มล.', sku: 'DRINK-001', quantitySold: 140, revenue: 1400, sharePercent: 28.8 },
        { productId: 'demo-product-3', name: 'ถุงกระดาษ', sku: 'PACK-001', quantitySold: 200, revenue: 600, sharePercent: 12.3 },
      ],
    } as T;
  }

  if (pathname === '/reports/inventory-valuation') {
    const items = products.map(p => {
      const qty = Number(p.quantity);
      const price = Number(p.price);
      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        barcode: p.barcode,
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        quantity: qty,
        unitPrice: price,
        valuation: qty * price,
      };
    });

    const totalValuation = items.reduce((s, i) => s + i.valuation, 0);
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const outOfStockCount = items.filter(i => i.quantity <= 0).length;
    const lowStockCount = items.filter(i => i.quantity > 0 && i.quantity <= 5).length;

    return {
      summary: {
        totalSKUs: items.length,
        totalUnits,
        totalValuation,
        outOfStockCount,
        lowStockCount,
      },
      items,
    } as T;
  }

  if (pathname.startsWith('/customers/') && pathname.endsWith('/ledger')) {
    const custId = pathname.split('/')[2];
    const cust = customers.find(c => c.id === custId);
    if (!cust) throw new ApiError(404, 'ไม่พบข้อมูลลูกค้า');
    return {
      customer: {
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        points: cust.points,
        lifetimePoints: cust.lifetimePoints || cust.points,
        tier: cust.tier || 'BRONZE',
      },
      ledgers: mockPointLedgers[custId] || [],
    } as T;
  }

  if (pathname.startsWith('/customers/') && pathname.endsWith('/adjust-points')) {
    const custId = pathname.split('/')[2];
    const cust = customers.find(c => c.id === custId);
    if (!cust) throw new ApiError(404, 'ไม่พบข้อมูลลูกค้า');
    const amount = Number(input.amount) || 0;
    const reason = stringValue(input.reason).trim();
    if (!reason) throw new ApiError(400, 'กรุณาระบุเหตุผล');
    if (cust.points + amount < 0) throw new ApiError(400, 'แต้มสะสมไม่เพียงพอสำหรับการปรับลด');
    cust.points += amount;
    if (amount > 0) cust.lifetimePoints = (cust.lifetimePoints || 0) + amount;
    if (!mockPointLedgers[custId]) mockPointLedgers[custId] = [];
    const newEntry: PointLedgerItem = {
      id: `pl-${Date.now()}`,
      type: 'ADJUST',
      amount,
      balanceAfter: cust.points,
      reason,
      actorName: profile.user.displayName,
      createdAt: new Date().toISOString(),
    };
    mockPointLedgers[custId].unshift(newEntry);
    return { customer: cust, ledger: newEntry } as T;
  }

  if (pathname === '/loyalty/rewards') {
    if (body !== undefined) {
      const newReward: LoyaltyReward = {
        id: `reward-${Date.now()}`,
        title: stringValue(input.title),
        pointsCost: Number(input.pointsCost) || 50,
        discountAmount: String(Number(input.discountAmount) || 0),
        active: true,
        createdAt: new Date().toISOString(),
      };
      mockLoyaltyRewards.unshift(newReward);
      return newReward as T;
    }
    return mockLoyaltyRewards as T;
  }

  if (pathname.startsWith('/loyalty/rewards/') && pathname.endsWith('/toggle')) {
    const id = pathname.split('/')[3];
    const rew = mockLoyaltyRewards.find(r => r.id === id);
    if (!rew) throw new ApiError(404, 'ไม่พบของรางวัล');
    rew.active = !rew.active;
    return rew as T;
  }

  if (pathname.startsWith('/loyalty/rewards/')) {
    const id = pathname.split('/')[3];
    const rew = mockLoyaltyRewards.find(r => r.id === id);
    if (!rew) throw new ApiError(404, 'ไม่พบของรางวัล');
    if (input.title !== undefined) rew.title = stringValue(input.title);
    if (input.pointsCost !== undefined) rew.pointsCost = Number(input.pointsCost);
    if (input.discountAmount !== undefined) rew.discountAmount = String(Number(input.discountAmount));
    if (input.active !== undefined) rew.active = Boolean(input.active);
    return rew as T;
  }

  // STOCK TAKES
  if (pathname === '/stock-takes' && body === undefined) {
    const branchId = query.get('branchId');
    const status = query.get('status');
    let list = mockStockTakes;
    if (branchId) list = list.filter(st => st.branchId === branchId);
    if (status) list = list.filter(st => st.status === status);
    return list.map(({ items, ...summary }) => summary) as T;
  }

  if (pathname.startsWith('/stock-takes/') && pathname.endsWith('/counts')) {
    const id = pathname.replace('/stock-takes/', '').replace('/counts', '');
    const st = mockStockTakes.find(s => s.id === id);
    if (!st) throw new ApiError(404, 'ไม่พบรายการตรวจนับสต็อก');
    if (st.status !== 'IN_PROGRESS') throw new ApiError(400, 'สามารถบันทึกยอดนับได้เฉพาะรายการที่กำลังดำเนินการ');
    const updateItems = (Array.isArray(input.items) ? input.items : []) as { itemId: string; countedQuantity: string; note?: string }[];
    for (const update of updateItems) {
      const item = st.items.find(i => i.id === update.itemId);
      if (item) {
        const sysQty = Number(item.systemQuantity);
        const cntQty = Number(update.countedQuantity);
        const variance = cntQty - sysQty;
        const unitPrice = Number(item.unitPrice);
        const varianceValue = variance * unitPrice;
        item.countedQuantity = String(cntQty);
        item.variance = String(variance);
        item.varianceValue = varianceValue.toFixed(2);
        if (update.note !== undefined) item.note = update.note;
      }
    }
    const withVar = st.items.filter(i => Number(i.variance) !== 0);
    st.itemsWithVariance = withVar.length;
    st.totalVarianceValue = st.items.reduce((sum, i) => sum + Number(i.varianceValue), 0).toFixed(2);
    return { success: true, updatedCount: updateItems.length } as T;
  }

  if (pathname.startsWith('/stock-takes/') && pathname.endsWith('/approve')) {
    const id = pathname.replace('/stock-takes/', '').replace('/approve', '');
    const st = mockStockTakes.find(s => s.id === id);
    if (!st) throw new ApiError(404, 'ไม่พบรายการตรวจนับสต็อก');
    if (st.status !== 'IN_PROGRESS') throw new ApiError(400, 'สามารถอนุมัติได้เฉพาะรายการที่กำลังดำเนินการ');
    
    let adjustedCount = 0;
    for (const item of st.items) {
      const variance = Number(item.variance);
      if (variance !== 0) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const before = Number(prod.quantity);
          const after = before + variance;
          prod.quantity = String(Math.max(0, after));
          movements.unshift({
            id: crypto.randomUUID(),
            type: 'ADJUSTMENT',
            quantity: String(variance),
            balanceBefore: String(before),
            balanceAfter: String(after),
            note: `ปรับยอดจากตรวจนับสต็อก #${st.takeNumber}${item.note ? ` (${item.note})` : ''}`,
            createdAt: new Date().toISOString(),
            product: { name: prod.name, sku: prod.sku },
            actor: { user: { displayName: profile.user.displayName } },
          });
          adjustedCount++;
        }
      }
    }
    st.status = 'COMPLETED';
    st.approvedByName = profile.user.displayName;
    st.completedAt = new Date().toISOString();
    return { id: st.id, takeNumber: st.takeNumber, status: st.status, completedAt: st.completedAt, adjustedCount } as T;
  }

  if (pathname.startsWith('/stock-takes/') && pathname.endsWith('/cancel')) {
    const id = pathname.replace('/stock-takes/', '').replace('/cancel', '');
    const st = mockStockTakes.find(s => s.id === id);
    if (!st) throw new ApiError(404, 'ไม่พบรายการตรวจนับสต็อก');
    if (st.status !== 'IN_PROGRESS') throw new ApiError(400, 'สามารถยกเลิกได้เฉพาะรายการที่กำลังดำเนินการ');
    st.status = 'CANCELLED';
    st.cancelledAt = new Date().toISOString();
    return { id: st.id, takeNumber: st.takeNumber, status: st.status } as T;
  }

  if (pathname.startsWith('/stock-takes/') && body === undefined) {
    const id = pathname.replace('/stock-takes/', '');
    const found = mockStockTakes.find(st => st.id === id);
    if (!found) throw new ApiError(404, 'ไม่พบรายการตรวจนับสต็อก');
    return found as T;
  }

  if (pathname === '/stock-takes') {
    const branchId = stringValue(input.branchId) || profile.branches[0]?.id;
    const branch = profile.branches.find(b => b.id === branchId) || profile.branches[0];
    const takeNumber = `ST-260923-${String(mockStockTakes.length + 1).padStart(4, '0')}`;
    const activeProducts = products.filter(p => p.active);
    const items: StockTakeItem[] = activeProducts.map((p, idx) => ({
      id: `sti-${Date.now()}-${idx}`,
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      barcode: p.barcode,
      systemQuantity: p.quantity,
      countedQuantity: p.quantity,
      variance: '0',
      unitPrice: p.price,
      varianceValue: '0.00',
      note: null,
    }));
    const newTake: StockTakeDetail = {
      id: `st-${Date.now()}`,
      takeNumber,
      status: 'IN_PROGRESS',
      branchId: branch?.id ?? 'demo-sukhumvit',
      branchName: branch?.name ?? 'สาขาหลัก',
      createdByName: profile.user.displayName,
      approvedByName: null,
      note: stringValue(input.note) || null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cancelledAt: null,
      totalItems: items.length,
      itemsWithVariance: 0,
      totalVarianceValue: '0.00',
      items,
    };
    mockStockTakes.unshift(newTake);
    const { items: _, ...summary } = newTake;
    return summary as T;
  }

  // TAX INVOICES & BRANCH TAX SETTINGS
  if (pathname.startsWith('/branches/') && pathname.endsWith('/tax-settings') && body === undefined) {
    const id = pathname.replace('/branches/', '').replace('/tax-settings', '');
    const settings = mockBranchTaxSettings[id] || {
      id,
      name: profile.branches.find(b => b.id === id)?.name || 'สาขา',
      companyName: profile.tenant.name,
      taxId: '0105559012345',
      taxAddress: 'กรุงเทพมหานคร',
      branchNumber: '00000',
      isHeadOffice: true,
      phone: '02-000-0000',
      receiptHeader: null,
      receiptFooter: null,
    };
    return settings as T;
  }

  if (pathname.startsWith('/branches/') && pathname.endsWith('/tax-settings')) {
    const id = pathname.replace('/branches/', '').replace('/tax-settings', '');
    const branch = profile.branches.find(b => b.id === id);
    const existing = mockBranchTaxSettings[id] || {
      id,
      name: branch?.name || 'สาขา',
      isHeadOffice: true,
    };
    const updated = {
      ...existing,
      companyName: stringValue(input.companyName) || existing.companyName,
      taxId: stringValue(input.taxId) || existing.taxId,
      taxAddress: stringValue(input.taxAddress) || existing.taxAddress,
      branchNumber: stringValue(input.branchNumber) || existing.branchNumber,
      isHeadOffice: input.isHeadOffice !== undefined ? Boolean(input.isHeadOffice) : existing.isHeadOffice,
      phone: stringValue(input.phone) || existing.phone,
      receiptHeader: stringValue(input.receiptHeader) || null,
      receiptFooter: stringValue(input.receiptFooter) || null,
    };
    mockBranchTaxSettings[id] = updated;
    return updated as T;
  }

  // PROMPTPAY & PAYMENT SLIP VERIFICATION
  if (pathname.startsWith('/branches/') && pathname.endsWith('/promptpay') && body === undefined) {
    const id = pathname.replace('/branches/', '').replace('/promptpay', '');
    const promptPay = mockBranchPromptPay[id] || {
      id,
      name: profile.branches.find(b => b.id === id)?.name || 'สาขา',
      promptPayType: 'MOBILE',
      promptPayAccount: '0812345678',
      promptPayName: profile.tenant.name,
      promptPayBank: 'KBANK',
    };
    return promptPay as T;
  }

  if (pathname.startsWith('/branches/') && pathname.endsWith('/promptpay') && body !== undefined) {
    const id = pathname.replace('/branches/', '').replace('/promptpay', '');
    const existing = mockBranchPromptPay[id] || {
      id,
      name: profile.branches.find(b => b.id === id)?.name || 'สาขา',
      promptPayType: 'MOBILE',
      promptPayAccount: null,
      promptPayName: null,
      promptPayBank: null,
    };
    const updated: BranchPromptPay = {
      ...existing,
      promptPayType: (stringValue(input.promptPayType) as any) || existing.promptPayType,
      promptPayAccount: stringValue(input.promptPayAccount) || null,
      promptPayName: stringValue(input.promptPayName) || null,
      promptPayBank: stringValue(input.promptPayBank) || null,
    };
    mockBranchPromptPay[id] = updated;
    return updated as T;
  }

  if (pathname.startsWith('/branches/') && pathname.endsWith('/promptpay/dynamic-qr') && body !== undefined) {
    const id = pathname.replace('/branches/', '').replace('/promptpay/dynamic-qr', '');
    const pp = mockBranchPromptPay[id] || {
      id,
      name: 'สาขา',
      promptPayType: 'MOBILE',
      promptPayAccount: '0812345678',
      promptPayName: profile.tenant.name,
      promptPayBank: 'KBANK',
    };
    const rawAmt = input.amount;
    const numAmt = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt)) || 0;
    const ref1 = stringValue(input.ref1) || undefined;
    const payload = generatePromptPayPayload({
      target: pp.promptPayAccount || '0812345678',
      targetType: pp.promptPayType || 'MOBILE',
      amount: numAmt,
      ref1,
    });
    return {
      payload,
      target: pp.promptPayAccount || '0812345678',
      targetType: pp.promptPayType || 'MOBILE',
      accountName: pp.promptPayName || profile.tenant.name,
      bank: pp.promptPayBank || 'KBANK',
      amount: numAmt,
      ref1,
    } as T;
  }

  if (pathname === '/sales/verify-slip' && body !== undefined) {
    const transferRef = stringValue(input.transferRef) || '';
    const expectedAmount = typeof input.expectedAmount === 'number' ? input.expectedAmount : parseFloat(String(input.expectedAmount)) || 0;
    const slipImageUrl = stringValue(input.slipImageUrl) || null;

    if (!transferRef) {
      throw new ApiError(400, 'กรุณาระบุเลขอ้างอิงสลิป');
    }

    // Check duplicate
    const existing = sales.find(s => s.paymentDetail && (s.paymentDetail as any).transferRef === transferRef);
    if (existing) {
      return {
        verified: false,
        reason: 'สลิปนี้เคยถูกใช้งานบันทึกรายการไปแล้วในระบบ (Duplicate Slip)',
        duplicateSaleId: existing.id,
      } as T;
    }

    return {
      verified: true,
      transferRef,
      matchedAmount: expectedAmount,
      verifiedAt: new Date().toISOString(),
      slipImageUrl,
      message: 'ตรวจสอบสลิปสำเร็จ ยอดเงินถูกต้อง',
    } as T;
  }

  if (pathname.startsWith('/sales/') && pathname.endsWith('/tax-invoice') && body !== undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/tax-invoice', '');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new ApiError(404, 'ไม่พบรายการขาย');
    const existing = mockTaxInvoices.find(t => t.saleId === saleId && t.status === 'ISSUED');
    if (existing) return existing as T;

    const branch = profile.branches[0];
    const taxSettings = mockBranchTaxSettings[branch.id] || {
      name: branch.name,
      taxId: '0105559012345',
      taxAddress: '123 ถนนสุขุมวิท กรุงเทพฯ',
      branchNumber: '00000',
      isHeadOffice: true,
      phone: '02-123-4567',
    };

    const totalNum = Number(sale.total);
    const { taxableAmount, vatAmount, vatRate } = calculateVat(totalNum, 7);
    const invoiceNumber = `TAX-260923-${String(mockTaxInvoices.length + 1).padStart(4, '0')}`;

    const newInv: TaxInvoice = {
      id: `tax-demo-${Date.now()}`,
      invoiceNumber,
      type: 'FULL',
      status: 'ISSUED',
      saleId,
      receiptNumber: sale.receiptNumber,
      issuedAt: new Date().toISOString(),
      issuedByName: profile.user.displayName,
      issuer: {
        name: taxSettings.companyName || taxSettings.name || branch.name,
        taxId: taxSettings.taxId || '0105559012345',
        address: taxSettings.taxAddress || 'กรุงเทพมหานคร',
        branchNumber: taxSettings.branchNumber || '00000',
        isHeadOffice: taxSettings.isHeadOffice ?? true,
        phone: taxSettings.phone || '02-000-0000',
        receiptHeader: taxSettings.receiptHeader,
        receiptFooter: taxSettings.receiptFooter,
      },
      customer: {
        name: stringValue(input.customerName) || sale.customer?.name || 'ลูกค้าทั่วไป',
        taxId: stringValue(input.customerTaxId) || null,
        address: stringValue(input.customerAddress) || null,
        branchNumber: stringValue(input.customerBranchNumber) || '00000',
        isHeadOffice: input.customerIsHeadOffice !== undefined ? Boolean(input.customerIsHeadOffice) : true,
        phone: stringValue(input.customerPhone) || sale.customer?.phone || null,
      },
      subtotal: sale.subtotal,
      discount: sale.discount,
      taxableAmount,
      vatRate,
      vatAmount,
      total: sale.total,
      bahtText: bahtText(totalNum),
      paymentMethod: sale.paymentMethod,
      note: stringValue(input.note) || null,
      items: sale.items.map(it => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        price: it.price,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
    };
    mockTaxInvoices.unshift(newInv);
    return newInv as T;
  }

  if (pathname.startsWith('/sales/') && pathname.endsWith('/tax-invoice') && body === undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/tax-invoice', '');
    const found = mockTaxInvoices.find(t => t.saleId === saleId && t.status === 'ISSUED');
    return (found || null) as T;
  }

  if (pathname.startsWith('/tax-invoices/') && body === undefined) {
    const id = pathname.replace('/tax-invoices/', '');
    const found = mockTaxInvoices.find(t => t.id === id);
    if (!found) throw new ApiError(404, 'ไม่พบใบกำกับภาษี');
    return found as T;
  }

  // AUDIT LOGS
  if (pathname === '/audits' && body === undefined) {
    if (profile.role !== 'OWNER' && profile.role !== 'MANAGER') {
      throw new ApiError(403, 'ไม่มีสิทธิ์เข้าถึงประวัติการตรวจสอบ (Audit Log)');
    }
    const action = query.get('action');
    const category = query.get('category');
    const actorUserId = query.get('actorUserId');
    const search = (query.get('search') || '').trim().toLowerCase();
    const startDate = query.get('startDate');
    const endDate = query.get('endDate');
    const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(query.get('offset') || '0', 10) || 0, 0);

    let filtered = [...mockAudits];

    if (action) {
      filtered = filtered.filter(a => a.action === action);
    }
    if (category) {
      filtered = filtered.filter(a => a.category === category);
    }
    if (actorUserId) {
      filtered = filtered.filter(a => a.actorUserId === actorUserId);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      filtered = filtered.filter(a => new Date(a.createdAt).getTime() >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      filtered = filtered.filter(a => new Date(a.createdAt).getTime() <= end);
    }
    if (search) {
      filtered = filtered.filter(a => {
        const str = `${a.action} ${a.actionLabel || ''} ${a.actor?.displayName || ''} ${a.actor?.email || ''} ${a.entityType} ${a.entityId || ''} ${JSON.stringify(a.details)}`.toLowerCase();
        return str.includes(search);
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      items: paginated,
      total,
      limit,
      offset,
    } as T;
  }

  if (pathname === '/audits/metrics' && body === undefined) {
    if (profile.role !== 'OWNER' && profile.role !== 'MANAGER') {
      throw new ApiError(403, 'ไม่มีสิทธิ์เข้าถึงประวัติการตรวจสอบ (Audit Log)');
    }
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const todayCount = mockAudits.filter(a => new Date(a.createdAt).getTime() >= startOfToday).length;
    const weekCount = mockAudits.filter(a => new Date(a.createdAt).getTime() >= sevenDaysAgo).length;
    const criticalCount = mockAudits.filter(a => a.severity === 'CRITICAL').length;

    const categoryCounts: Record<string, number> = {};
    const actorMap: Record<string, { actorId: string; name: string; email: string; count: number }> = {};

    for (const item of mockAudits) {
      const cat = item.category || 'OTHER';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      if (item.actorUserId && item.actor) {
        if (!actorMap[item.actorUserId]) {
          actorMap[item.actorUserId] = {
            actorId: item.actorUserId,
            name: item.actor.displayName,
            email: item.actor.email,
            count: 0,
          };
        }
        actorMap[item.actorUserId].count += 1;
      }
    }

    const topActors = Object.values(actorMap).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      totalCount: mockAudits.length,
      todayCount,
      weekCount,
      criticalCount,
      categoryCounts,
      topActors,
    } as T;
  }

  if (pathname === '/audits/actions' && body === undefined) {
    const distinct = Array.from(new Set(mockAudits.map(a => a.action)));
    return distinct as T;
  }

  if (pathname.startsWith('/audits/') && body === undefined) {
    const id = pathname.replace('/audits/', '');
    const found = mockAudits.find(a => a.id === id);
    if (!found) throw new ApiError(404, 'ไม่พบบันทึกการตรวจสอบ');
    return found as T;
  }

  // LINE OFFICIAL ACCOUNT & E-RECEIPT
  if (pathname === '/line/settings' && body === undefined) {
    return mockLineSettings as T;
  }

  if (pathname === '/line/settings' && body !== undefined) {
    mockLineSettings = {
      ...mockLineSettings,
      accountName: stringValue(input.accountName) || mockLineSettings.accountName,
      basicId: stringValue(input.basicId) || null,
      channelId: stringValue(input.channelId) || null,
      channelSecret: stringValue(input.channelSecret) || null,
      channelAccessToken: stringValue(input.channelAccessToken) || null,
      autoSendReceipt: input.autoSendReceipt !== undefined ? Boolean(input.autoSendReceipt) : mockLineSettings.autoSendReceipt,
      welcomeMessage: stringValue(input.welcomeMessage) || null,
      qrCodeUrl: stringValue(input.qrCodeUrl) || null,
      active: input.active !== undefined ? Boolean(input.active) : mockLineSettings.active,
      isConfigured: Boolean(input.channelAccessToken && String(input.channelAccessToken).length > 5),
    };
    return mockLineSettings as T;
  }

  if (pathname === '/line/test-connection' && body !== undefined) {
    if (!mockLineSettings.channelAccessToken) {
      return { connected: false, message: 'ยังไม่ได้ระบุ Channel Access Token ในการตั้งค่า LINE OA' } as T;
    }
    return {
      connected: true,
      botName: mockLineSettings.accountName,
      basicId: mockLineSettings.basicId || '@rubtang_pos',
      message: 'เชื่อมต่อกับ LINE Messaging API สำเร็จ พร้อมใช้งานส่ง E-Receipt',
    } as T;
  }

  if (pathname.startsWith('/line/customers/') && pathname.endsWith('/link') && body !== undefined) {
    const id = pathname.replace('/line/customers/', '').replace('/link', '');
    const cust = customers.find(c => c.id === id);
    if (!cust) throw new ApiError(404, 'ไม่พบข้อมูลลูกค้า');
    cust.lineUserId = stringValue(input.lineUserId);
    cust.lineDisplayName = stringValue(input.lineDisplayName) || cust.name;
    cust.linePictureUrl = stringValue(input.linePictureUrl) || null;
    cust.lineLinkedAt = new Date().toISOString();
    return cust as T;
  }

  if (pathname.startsWith('/line/customers/') && pathname.endsWith('/unlink') && body !== undefined) {
    const id = pathname.replace('/line/customers/', '').replace('/unlink', '');
    const cust = customers.find(c => c.id === id);
    if (!cust) throw new ApiError(404, 'ไม่พบข้อมูลลูกค้า');
    cust.lineUserId = null;
    cust.lineDisplayName = null;
    cust.linePictureUrl = null;
    cust.lineLinkedAt = null;
    return cust as T;
  }

  if (pathname.startsWith('/sales/') && pathname.endsWith('/send-line-receipt') && body !== undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/send-line-receipt', '');
    const sale = sales.find(s => s.id === saleId) || sales[0];
    if (!sale) throw new ApiError(404, 'ไม่พบรายการขาย');

    const customer = customers.find(c => c.id === sale.customer?.id);
    const lineUserId = stringValue(input.lineUserId) || customer?.lineUserId || 'U_demo_somchai';

    const newLog: LineReceiptLog = {
      id: `log-demo-${Date.now()}`,
      tenantId: 'demo-tenant',
      saleId: sale.id,
      customerId: customer?.id || null,
      lineUserId,
      receiptNumber: sale.receiptNumber,
      status: 'SENT',
      flexPayload: {
        type: 'flex',
        altText: `ใบเสร็จรับเงินอิเล็กทรอนิกส์ ${sale.receiptNumber} (ร้านรับตังค์เดโม) ฿${sale.total}`,
        contents: {
          type: 'bubble',
          size: 'mega',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#06C755',
            paddingAll: '16px',
            contents: [
              { type: 'text', text: 'E-RECEIPT · ใบเสร็จรับเงินอิเล็กทรอนิกส์', color: '#dcfce7', size: 'xxs', weight: 'bold' },
              { type: 'text', text: 'ร้านรับตังค์เดโม', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'sm' },
              { type: 'text', text: `เลขที่: ${sale.receiptNumber}`, color: '#f0fdf4', size: 'xs', margin: 'xs' },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'วันที่:', size: 'xxs', color: '#64748b', flex: 1 },
                  { type: 'text', text: new Date().toLocaleString('th-TH'), size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'xs',
                contents: [
                  { type: 'text', text: 'สาขา:', size: 'xxs', color: '#64748b', flex: 1 },
                  { type: 'text', text: sale.branchName || 'สาขาสุขุมวิท', size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
                ],
              },
              { type: 'separator', margin: 'md', color: '#e2e8f0' },
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                contents: (sale.items || [
                  { name: 'กาแฟอเมริกาโน่', quantity: '2', subtotal: '110.00' },
                  { name: 'น้ำดื่ม 600 มล.', quantity: '1', subtotal: '10.00' },
                ]).map((it: any) => ({
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  contents: [
                    { type: 'text', text: `${it.name} × ${it.quantity}`, size: 'xs', color: '#334155', flex: 4 },
                    { type: 'text', text: `฿${Number(it.subtotal).toFixed(2)}`, size: 'xs', color: '#0f172a', flex: 2, align: 'end', weight: 'bold' },
                  ],
                })),
              },
              { type: 'separator', margin: 'md', color: '#e2e8f0' },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                contents: [
                  { type: 'text', text: 'ยอดสุทธิ (Total)', size: 'md', weight: 'bold', color: '#0f172a' },
                  { type: 'text', text: `฿${Number(sale.total).toFixed(2)}`, size: 'xl', weight: 'bold', color: '#06C755', align: 'end' },
                ],
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: 'ดูใบเสร็จฉบับเต็ม / PDF',
                  uri: `https://rubtang.pos/receipts/${sale.id}`,
                },
                style: 'primary',
                color: '#06C755',
                height: 'sm',
              },
            ],
          },
        },
      },
      errorMessage: null,
      sentAt: new Date().toISOString(),
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, lineDisplayName: customer.lineDisplayName } : null,
      sale: { id: sale.id, receiptNumber: sale.receiptNumber, total: sale.total, createdAt: sale.createdAt },
    };

    mockLineReceiptLogs.unshift(newLog);

    return {
      success: true,
      logId: newLog.id,
      receiptNumber: sale.receiptNumber,
      lineUserId,
      status: 'SENT',
      flexMessage: newLog.flexPayload,
    } as T;
  }

  if (pathname === '/line/receipt-logs' && body === undefined) {
    const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(query.get('offset') || '0', 10) || 0, 0);
    const total = mockLineReceiptLogs.length;
    const items = mockLineReceiptLogs.slice(offset, offset + limit);
    return { items, total, limit, offset } as T;
  }

  // ── PARTIAL RETURNS & REFUNDS ──
  if (pathname.startsWith('/sales/') && pathname.endsWith('/returnable-items') && body === undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/returnable-items', '');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new ApiError(404, 'ไม่พบบิลขาย');
    if (sale.status === 'VOIDED') throw new ApiError(400, 'บิลขายนี้ถูกยกเลิกแล้ว ไม่สามารถคืนสินค้าได้');

    const returnableItems: ReturnableItem[] = sale.items
      .map(item => {
        const originalQty = Number(item.quantity);
        const retQty = Number(item.returnedQuantity || 0);
        const remainingQty = Math.max(0, originalQty - retQty);
        return {
          saleItemId: item.id || `item-${item.productId}`,
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          unitPrice: Number(item.price),
          originalQuantity: originalQty,
          returnedQuantity: retQty,
          remainingQuantity: remainingQty,
          lineSubtotal: Number(item.subtotal),
        };
      })
      .filter(item => item.remainingQuantity > 0);

    return {
      sale: {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        status: sale.status,
        total: Number(sale.total),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        pointsEarned: Math.floor(Number(sale.total) / 50),
        pointsRedeemed: 0,
        paymentMethod: sale.paymentMethod,
        createdAt: sale.createdAt,
        branch: { id: 'demo-sukhumvit', name: sale.branchName },
        customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone, points: 120 } : null,
      },
      items: returnableItems,
    } as T;
  }

  if (pathname.startsWith('/sales/') && pathname.endsWith('/returns') && body !== undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/returns', '');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new ApiError(404, 'ไม่พบบิลขาย');
    if (sale.status === 'VOIDED') throw new ApiError(400, 'บิลขายนี้ถูกยกเลิกแล้ว ไม่สามารถคืนสินค้าได้');

    const returnPayload = body as {
      refundMethod: 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'ORIGINAL_PAYMENT';
      reason: string;
      items: {
        saleItemId: string;
        quantity: string;
        restock?: boolean;
        condition?: 'RESTOCKABLE' | 'DAMAGED';
        note?: string;
      }[];
    };

    if (!returnPayload.items || returnPayload.items.length === 0) {
      throw new ApiError(400, 'กรุณาเลือกรายการสินค้าที่ต้องการคืนอย่างน้อย 1 รายการ');
    }

    const saleTotal = Number(sale.total);
    const saleSubtotal = Number(sale.subtotal);
    const saleDiscount = Number(sale.discount);
    const discountRatio = saleSubtotal > 0 ? saleDiscount / saleSubtotal : 0;

    let totalRefund = 0;
    let subtotalRefund = 0;
    const returnItems: SaleReturnItem[] = [];

    for (const reqItem of returnPayload.items) {
      const saleItem = sale.items.find(it => (it.id || `item-${it.productId}`) === reqItem.saleItemId);
      if (!saleItem) throw new ApiError(404, 'ไม่พบสินค้าในบิลขาย');

      const returnQty = Number(reqItem.quantity);
      const originalQty = Number(saleItem.quantity);
      const alreadyReturned = Number(saleItem.returnedQuantity || 0);
      const remainingQty = originalQty - alreadyReturned;

      if (returnQty <= 0 || returnQty > remainingQty) {
        throw new ApiError(400, `จำนวนคืนสำหรับ ${saleItem.name} ต้องมากกว่า 0 และไม่เกิน ${remainingQty}`);
      }

      saleItem.returnedQuantity = String(alreadyReturned + returnQty);

      const unitPrice = Number(saleItem.price);
      const lineSubtotal = unitPrice * returnQty;
      const lineDiscount = Math.round(lineSubtotal * discountRatio * 100) / 100;
      const lineRefund = lineSubtotal - lineDiscount;

      subtotalRefund += lineSubtotal;
      totalRefund += lineRefund;

      const restock = reqItem.restock !== false;
      const condition = reqItem.condition || 'RESTOCKABLE';

      if (restock && condition === 'RESTOCKABLE') {
        const prod = products.find(p => p.id === saleItem.productId);
        if (prod) {
          const before = Number(prod.quantity);
          const after = before + returnQty;
          prod.quantity = String(after);
          movements.unshift({
            id: crypto.randomUUID(),
            type: 'RETURN',
            quantity: String(returnQty),
            balanceBefore: String(before),
            balanceAfter: String(after),
            note: `คืนสินค้าจากบิล ${sale.receiptNumber} (${returnPayload.reason})`,
            createdAt: new Date().toISOString(),
            product: { name: prod.name, sku: prod.sku },
            actor: { user: { displayName: profile.user.displayName } },
          });
        }
      }

      returnItems.push({
        id: `ret-item-${Date.now()}-${returnItems.length}`,
        productName: saleItem.name,
        sku: saleItem.sku,
        quantity: returnQty,
        unitPrice,
        discount: lineDiscount,
        refundAmount: lineRefund,
        restock,
        condition,
        note: reqItem.note || null,
      });
    }

    let pointsDeducted = 0;
    if (sale.customer) {
      const cust = customers.find(c => c.id === sale.customer?.id);
      if (cust) {
        const earnedPoints = Math.floor(saleTotal / 50);
        pointsDeducted = saleTotal > 0 ? Math.floor((totalRefund / saleTotal) * earnedPoints) : 0;
        if (pointsDeducted > 0) {
          cust.points = Math.max(0, cust.points - pointsDeducted);
          if (!mockPointLedgers[cust.id]) mockPointLedgers[cust.id] = [];
          mockPointLedgers[cust.id].unshift({
            id: `pl-${Date.now()}-ret`,
            type: 'REVERT',
            amount: -pointsDeducted,
            balanceAfter: cust.points,
            reason: `หักแต้มคืนสินค้าจากบิล ${sale.receiptNumber}`,
            saleReceiptNumber: sale.receiptNumber,
            actorName: profile.user.displayName,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    const yy = String(new Date().getFullYear()).slice(-2);
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    const dd = String(new Date().getDate()).padStart(2, '0');
    const code = Math.random().toString(16).slice(2, 8).toUpperCase();
    const returnNumber = `CN-${yy}${mm}${dd}-${code}`;

    const newReturn: SaleReturn = {
      id: `ret-${Date.now()}`,
      returnNumber,
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      branch: { id: 'demo-sukhumvit', name: sale.branchName },
      customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null,
      refundMethod: returnPayload.refundMethod,
      subtotalRefund,
      vatRefund: Math.round((totalRefund * 7 / 107) * 100) / 100,
      totalRefund,
      pointsDeducted,
      reason: returnPayload.reason,
      items: returnItems,
      createdAt: new Date().toISOString(),
      allFullyReturned: sale.items.every(it => Number(it.returnedQuantity || 0) >= Number(it.quantity)),
    };

    mockReturns.unshift(newReturn);

    mockAudits.unshift({
      id: `audit-${Date.now()}`,
      action: 'SALE_RETURNED',
      actionLabel: 'คืนสินค้าและคืนเงิน (Refund)',
      category: 'SALES',
      severity: 'WARNING',
      entityType: 'SaleReturn',
      entityId: newReturn.id,
      actorUserId: profile.user.id,
      actor: { id: profile.user.id, displayName: profile.user.displayName, email: profile.user.email },
      details: {
        returnNumber: newReturn.returnNumber,
        receiptNumber: sale.receiptNumber,
        totalRefund: newReturn.totalRefund,
        refundMethod: newReturn.refundMethod,
        reason: newReturn.reason,
        itemsCount: returnItems.length,
      },
      createdAt: new Date().toISOString(),
    });

    return newReturn as T;
  }

  if (pathname.startsWith('/sales/') && pathname.endsWith('/returns') && body === undefined) {
    const saleId = pathname.replace('/sales/', '').replace('/returns', '');
    const sale = sales.find(s => s.id === saleId);
    const returnsForSale = mockReturns.filter(r => r.saleId === saleId).map(r => ({
      id: r.id,
      returnNumber: r.returnNumber,
      receiptNumber: r.receiptNumber,
      branch: r.branch,
      refundMethod: r.refundMethod,
      totalRefund: r.totalRefund,
      pointsDeducted: r.pointsDeducted,
      reason: r.reason,
      processedBy: profile.user.displayName,
      itemCount: r.items.length,
      items: r.items.map(it => ({
        productName: it.productName,
        sku: it.sku,
        quantity: it.quantity,
        refundAmount: it.refundAmount,
        restock: it.restock,
        condition: it.condition,
      })),
      createdAt: r.createdAt,
    }));
    return {
      saleId,
      receiptNumber: sale?.receiptNumber || '',
      returns: returnsForSale,
    } as T;
  }

  if (pathname === '/returns' && body === undefined) {
    const branchId = query.get('branchId');
    const startDate = query.get('startDate');
    const endDate = query.get('endDate');
    const limit = Math.min(Math.max(parseInt(query.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(query.get('offset') || '0', 10) || 0, 0);

    let filtered = [...mockReturns];
    if (branchId) filtered = filtered.filter(r => r.branch.id === branchId);
    if (startDate) {
      const s = new Date(startDate).getTime();
      filtered = filtered.filter(r => new Date(r.createdAt).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      filtered = filtered.filter(r => new Date(r.createdAt).getTime() <= e);
    }

    const items: SaleReturnListItem[] = filtered.slice(offset, offset + limit).map(r => ({
      id: r.id,
      returnNumber: r.returnNumber,
      receiptNumber: r.receiptNumber,
      branch: r.branch,
      refundMethod: r.refundMethod,
      totalRefund: r.totalRefund,
      pointsDeducted: r.pointsDeducted,
      reason: r.reason,
      processedBy: profile.user.displayName,
      itemCount: r.items.length,
      items: r.items.map(it => ({
        productName: it.productName,
        sku: it.sku,
        quantity: it.quantity,
        refundAmount: it.refundAmount,
        restock: it.restock,
        condition: it.condition,
      })),
      createdAt: r.createdAt,
    }));

    return { items, total: filtered.length } as T;
  }

  if (pathname.startsWith('/returns/') && body === undefined) {
    const returnId = pathname.replace('/returns/', '');
    const found = mockReturns.find(r => r.id === returnId);
    if (!found) throw new ApiError(404, 'ไม่พบรายการคืนสินค้า');
    return found as T;
  }

  throw new ApiError(404, `Mock endpoint not found: ${pathname}`);
}


const mockPromotions: any[] = [
  {
    id: 'promo-demo-1',
    name: 'ส่วนลดต้อนรับเปิดร้าน 50 บาท',
    code: 'RUBTANG50',
    discountType: 'FIXED_AMOUNT',
    discountValue: 50,
    minSpend: 200,
    maxDiscount: null,
    branchId: null,
    branchName: 'ทุกสาขา',
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'promo-demo-2',
    name: 'ลด 10% สำหรับยอด 300 ขึ้นไป',
    code: 'SALE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minSpend: 300,
    maxDiscount: 150,
    branchId: null,
    branchName: 'ทุกสาขา',
    active: true,
    createdAt: new Date().toISOString(),
  },
];


const mockTransfers: any[] = [
  {
    id: 'tr-demo-1',
    transferNumber: 'TR-260923-0001',
    originBranchId: 'demo-sukhumvit',
    destinationBranchId: 'demo-siam',
    status: 'IN_TRANSIT',
    notes: 'โอนช่วยสาขาสยาม วันเปิดตัว',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    originBranch: { id: 'demo-sukhumvit', name: 'สาขาสุขุมวิท' },
    destinationBranch: { id: 'demo-siam', name: 'สาขาสยาม' },
    createdBy: { user: { displayName: 'เจ้าของร้านเดโม' } },
    receivedBy: null,
    items: [
      {
        id: 'tr-item-1',
        productId: 'demo-product-1',
        quantity: 12,
        product: { id: 'demo-product-1', name: 'น้ำดื่ม 600 มล.', sku: 'DRINK-001' },
      },
      {
        id: 'tr-item-2',
        productId: 'demo-product-2',
        quantity: 5,
        product: { id: 'demo-product-2', name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001' },
      },
    ],
  },
];


let mockShift: any = {
  id: 'shift-demo-1',
  branchId: 'demo-sukhumvit',
  cashierId: 'demo-cashier',
  cashierName: 'เจ้าของร้านเดโม',
  status: 'OPEN',
  startingCash: 1000,
  cashSales: 108,
  transferSales: 0,
  expectedCash: 1108,
  salesCount: 1,
  notes: 'กะเปิดร้านตอนเช้า',
  openedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
};
const mockPastShifts: any[] = [];

const mockSuppliers: any[] = [
  {
    id: 'supp-demo-1',
    name: 'ABC Trading Co., Ltd.',
    contactName: 'คุณสมชาย พาณิชย์',
    phone: '081-234-5678',
    email: 'contact@abctrading.com',
    address: '123/45 ถนนสุขุมวิท กรุงเทพฯ',
    creditDays: 30,
    active: true,
    poCount: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'supp-demo-2',
    name: 'Fresh Supply ฟาร์มสด',
    contactName: 'คุณวิภา แจ่มใส',
    phone: '089-876-5432',
    email: 'fresh@supplyfarm.co.th',
    address: '88 หมู่ 3 ต.แม่ริม จ.เชียงใหม่',
    creditDays: 15,
    active: true,
    poCount: 0,
    createdAt: new Date().toISOString(),
  },
];

const mockPurchaseOrders: any[] = [
  {
    id: 'po-demo-1',
    poNumber: 'PO-260923-0101',
    status: 'ORDERED',
    supplierId: 'supp-demo-1',
    supplierName: 'ABC Trading Co., Ltd.',
    branchId: 'demo-sukhumvit',
    branchName: 'สาขาสุขุมวิท',
    createdByName: 'เจ้าของร้านเดโม',
    receivedByName: null,
    totalAmount: 480,
    itemCount: 2,
    totalOrderedQty: 30,
    totalReceivedQty: 0,
    note: 'สั่งสต็อกเปิดร้าน',
    orderedAt: new Date().toISOString(),
    receivedAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    items: [
      {
        id: 'po-item-1',
        productId: 'demo-product-1',
        productName: 'น้ำดื่ม 600 มล.',
        sku: 'DRINK-001',
        barcode: '885000000001',
        orderedQuantity: 20,
        receivedQuantity: 0,
        unitCost: 6.5,
        totalCost: 130,
      },
      {
        id: 'po-item-2',
        productId: 'demo-product-2',
        productName: 'กาแฟอเมริกาโน่',
        sku: 'COFFEE-001',
        barcode: '885000000002',
        orderedQuantity: 10,
        receivedQuantity: 0,
        unitCost: 35,
        totalCost: 350,
      },
    ],
  },
];

const mockStockTakes: StockTakeDetail[] = [
  {
    id: 'st-demo-1',
    takeNumber: 'ST-260923-0001',
    status: 'IN_PROGRESS',
    branchId: 'demo-sukhumvit',
    branchName: 'สาขาสุขุมวิท',
    createdByName: 'เจ้าของร้านเดโม',
    approvedByName: null,
    totalItems: 3,
    itemsWithVariance: 1,
    totalVarianceValue: '-10.00',
    note: 'ตรวจนับสต็อกประจำสัปดาห์',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: null,
    cancelledAt: null,
    items: [
      {
        id: 'sti-1',
        productId: 'demo-product-1',
        productName: 'น้ำดื่ม 600 มล.',
        sku: 'DRINK-001',
        barcode: '885000000001',
        systemQuantity: '42',
        countedQuantity: '41',
        variance: '-1',
        unitPrice: '10.00',
        varianceValue: '-10.00',
        note: 'สินค้าแตกเสียหาย 1 ขวด',
      },
      {
        id: 'sti-2',
        productId: 'demo-product-2',
        productName: 'กาแฟอเมริกาโน่',
        sku: 'COFFEE-001',
        barcode: '885000000002',
        systemQuantity: '18',
        countedQuantity: '18',
        variance: '0',
        unitPrice: '55.00',
        varianceValue: '0.00',
        note: null,
      },
      {
        id: 'sti-3',
        productId: 'demo-product-3',
        productName: 'ถุงกระดาษ',
        sku: 'PACK-001',
        barcode: null,
        systemQuantity: '120',
        countedQuantity: '120',
        variance: '0',
        unitPrice: '3.00',
        varianceValue: '0.00',
        note: null,
      },
    ],
  },
];

const mockBranchTaxSettings: Record<string, BranchTaxSettings> = {
  'demo-sukhumvit': {
    id: 'demo-sukhumvit',
    name: 'สาขาสุขุมวิท',
    companyName: 'บริษัท รับตังค์ รีเทล จำกัด (สำนักงานใหญ่)',
    taxId: '0105559012345',
    taxAddress: '123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
    branchNumber: '00000',
    isHeadOffice: true,
    phone: '02-123-4567',
    receiptHeader: 'ยินดีต้อนรับสู่ร้านรับตังค์',
    receiptFooter: 'ขอบคุณที่ใช้บริการ / สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน',
  },
  'demo-siam': {
    id: 'demo-siam',
    name: 'สาขาสยาม',
    companyName: 'บริษัท รับตังค์ รีเทล จำกัด',
    taxId: '0105559012345',
    taxAddress: '999 อาคารสยามสแควร์ แขวงปทุมวัน เขตปทุมวัน กรุงเทพฯ 10330',
    branchNumber: '00001',
    isHeadOffice: false,
    phone: '02-987-6543',
    receiptHeader: 'ยินดีต้อนรับสู่ร้านรับตังค์ สาขาสยาม',
    receiptFooter: 'ขอบคุณที่ใช้บริการ',
  },
};

const mockTaxInvoices: TaxInvoice[] = [
  {
    id: 'tax-demo-1',
    invoiceNumber: 'TAX-260923-0001',
    type: 'FULL',
    status: 'ISSUED',
    saleId: 'sale-demo-1',
    receiptNumber: 'REC-260923-0101',
    issuedAt: new Date(Date.now() - 3600000).toISOString(),
    issuedByName: 'เจ้าของร้านเดโม',
    issuer: {
      name: 'บริษัท รับตังค์ รีเทล จำกัด (สำนักงานใหญ่)',
      taxId: '0105559012345',
      address: '123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
      branchNumber: '00000',
      isHeadOffice: true,
      phone: '02-123-4567',
      receiptHeader: 'ยินดีต้อนรับสู่ร้านรับตังค์',
      receiptFooter: 'ขอบคุณที่ใช้บริการ',
    },
    customer: {
      name: 'บริษัท สยาม ซอฟต์แวร์ โซลูชั่นส์ จำกัด',
      taxId: '0105561098765',
      address: '888 อาคารเอ็มไพร์ทาวเวอร์ ชั้น 20 ถนนสาทรใต้ แขวงยานนาวา เขตสาทร กรุงเทพฯ 10120',
      branchNumber: '00000',
      isHeadOffice: true,
      phone: '081-234-5678',
    },
    subtotal: '120.00',
    discount: '12.00',
    taxableAmount: '100.93',
    vatRate: '7.00',
    vatAmount: '7.07',
    total: '108.00',
    bahtText: 'หนึ่งร้อยแปดบาทถ้วน',
    paymentMethod: 'CASH',
    note: 'ออกใบกำกับภาษีเต็มรูปสำหรับสวัสดิการพนักงาน',
    items: [
      { productId: 'demo-product-2', name: 'กาแฟอเมริกาโน่', sku: 'COFFEE-001', price: '55.00', quantity: '2', subtotal: '110.00' },
      { productId: 'demo-product-1', name: 'น้ำดื่ม 600 มล.', sku: 'DRINK-001', price: '10.00', quantity: '1', subtotal: '10.00' },
    ],
  },
];

const mockBranchPromptPay: Record<string, BranchPromptPay> = {
  'demo-sukhumvit': {
    id: 'demo-sukhumvit',
    name: 'สาขาสุขุมวิท',
    promptPayType: 'MOBILE',
    promptPayAccount: '0812345678',
    promptPayName: 'บริษัท รับตังค์ รีเทล จำกัด',
    promptPayBank: 'KBANK',
  },
  'demo-siam': {
    id: 'demo-siam',
    name: 'สาขาสยาม',
    promptPayType: 'TAX_ID',
    promptPayAccount: '0105559012345',
    promptPayName: 'บริษัท รับตังค์ รีเทล จำกัด (สาขาสยาม)',
    promptPayBank: 'SCB',
  },
};

const mockAudits: AuditLogItem[] = [
  {
    id: 'audit-demo-1',
    action: 'SALE_VOIDED',
    actionLabel: 'ยกเลิกบิลขาย (Void)',
    category: 'SALES',
    severity: 'CRITICAL',
    entityType: 'SaleReceipt',
    entityId: 'sale-demo-void-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      receiptNumber: 'REC-260923-0099',
      total: '450.00',
      voidReason: 'ลูกค้าเปลี่ยนใจขอคืนสินค้า (รายการซ้ำซ้อน)',
      cashier: 'พนักงานขาย หน้าร้าน',
      refundedAmount: 450,
      paymentMethod: 'CASH',
      before: { status: 'COMPLETED', total: '450.00' },
      after: { status: 'VOIDED', total: '450.00', voidReason: 'ลูกค้าเปลี่ยนใจขอคืนสินค้า (รายการซ้ำซ้อน)' },
    },
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 'audit-demo-2',
    action: 'STOCK_MOVEMENT_CREATED',
    actionLabel: 'รับเข้า/ปรับยอดสต็อก',
    category: 'INVENTORY',
    severity: 'WARNING',
    entityType: 'StockMovement',
    entityId: 'sm-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      type: 'ADJUSTMENT',
      productName: 'กาแฟอเมริกาโน่',
      sku: 'COFFEE-001',
      reason: 'เมล็ดกาแฟหมดอายุ/ชำรุดเสียหายจากการขนส่ง',
      before: { quantity: '25.00' },
      after: { quantity: '18.00' },
      difference: -7,
    },
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'audit-demo-3',
    action: 'STOCK_TAKE_APPROVED',
    actionLabel: 'อนุมัติกระทบยอดสต็อก',
    category: 'INVENTORY',
    severity: 'WARNING',
    entityType: 'StockTake',
    entityId: 'st-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      stockTakeNumber: 'ST-260923-0001',
      branchName: 'สาขาสุขุมวิท',
      totalItems: 15,
      varianceCount: 2,
      netVarianceQty: -3,
      before: { status: 'COUNTING' },
      after: { status: 'APPROVED' },
    },
    createdAt: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: 'audit-demo-4',
    action: 'PRODUCT_UPDATED',
    actionLabel: 'แก้ไขข้อมูลสินค้า/ราคา',
    category: 'CATALOG',
    severity: 'INFO',
    entityType: 'Product',
    entityId: 'demo-product-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      productName: 'น้ำดื่ม 600 มล.',
      sku: 'DRINK-001',
      before: { price: '8.00', active: true },
      after: { price: '10.00', active: true },
      changedFields: ['price'],
    },
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-5',
    action: 'STAFF_INVITED',
    actionLabel: 'เพิ่ม/เชิญพนักงาน',
    category: 'ADMIN',
    severity: 'WARNING',
    entityType: 'Staff',
    entityId: 'staff-demo-2',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      invitedEmail: 'somchai.staff@rubtang.demo',
      displayName: 'สมชาย พนักงานขาย',
      role: 'CASHIER',
      assignedBranches: ['สาขาสยาม'],
    },
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-6',
    action: 'TRANSFER_INITIATED',
    actionLabel: 'เปิดใบโอนสินค้า',
    category: 'INVENTORY',
    severity: 'INFO',
    entityType: 'BranchTransfer',
    entityId: 'tr-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      transferNumber: 'TR-260923-0001',
      originBranch: 'สาขาสุขุมวิท',
      destinationBranch: 'สาขาสยาม',
      itemCount: 3,
      totalUnits: 45,
    },
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-7',
    action: 'POINTS_ADJUSTED',
    actionLabel: 'ปรับแต้มสะสมสมาชิก',
    category: 'MARKETING',
    severity: 'WARNING',
    entityType: 'Customer',
    entityId: 'demo-cust-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      customerName: 'คุณสมชาย ใจดี',
      phone: '0812345678',
      reason: 'ปรับยอดแต้มชดเชยระบบแต้มขัดข้อง',
      before: { points: 100 },
      after: { points: 120 },
      difference: +20,
    },
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-8',
    action: 'PROMOTION_CREATED',
    actionLabel: 'สร้างโปรโมชัน/คูปอง',
    category: 'MARKETING',
    severity: 'INFO',
    entityType: 'Promotion',
    entityId: 'promo-demo-2',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      promoName: 'ลด 10% สำหรับยอด 300 ขึ้นไป',
      code: 'SALE10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minSpend: 300,
    },
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-9',
    action: 'SHIFT_CLOSED',
    actionLabel: 'ปิดกะเงินสดและส่งยอด',
    category: 'SHIFT',
    severity: 'INFO',
    entityType: 'Shift',
    entityId: 'shift-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      shiftNumber: 'SH-260922-01',
      branchName: 'สาขาสุขุมวิท',
      cashierName: 'เจ้าของร้านเดโม',
      openingCash: '1000.00',
      closingCash: '12450.00',
      systemExpected: '12450.00',
      difference: '0.00',
    },
    createdAt: new Date(Date.now() - 28 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-10',
    action: 'PURCHASE_ORDER_RECEIVED',
    actionLabel: 'รับสินค้าตามใบสั่งซื้อ',
    category: 'PROCUREMENT',
    severity: 'INFO',
    entityType: 'PurchaseOrder',
    entityId: 'po-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      poNumber: 'PO-260923-0001',
      supplierName: 'บริษัท ไทยเบฟเวอเรจ จำกัด',
      totalAmount: '15000.00',
      receivedItemsCount: 5,
      before: { status: 'CONFIRMED' },
      after: { status: 'RECEIVED' },
    },
    createdAt: new Date(Date.now() - 36 * 3600000).toISOString(),
  },
  {
    id: 'audit-demo-11',
    action: 'SALE_COMPLETED',
    actionLabel: 'บันทึกการขาย',
    category: 'SALES',
    severity: 'INFO',
    entityType: 'SaleReceipt',
    entityId: 'sale-demo-1',
    actorUserId: 'demo-user',
    actor: { id: 'demo-user', displayName: 'เจ้าของร้านเดโม', email: 'owner@rubtang.demo' },
    details: {
      receiptNumber: 'REC-260923-0101',
      total: '108.00',
      paymentMethod: 'CASH',
      itemCount: 2,
    },
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
  },
];

let mockLineSettings: LineOaSettings = {
  id: 'line-settings-1',
  tenantId: 'demo-tenant',
  accountName: 'ร้านรับตังค์ Official',
  basicId: '@rubtang_pos',
  channelId: '2001234567',
  channelSecret: 'sec_demo_1234567890abcdef',
  channelAccessToken: 'mock_channel_access_token_demo_123456',
  autoSendReceipt: true,
  welcomeMessage: 'ยินดีต้อนรับสู่ร้านรับตังค์ ใบเสร็จอิเล็กทรอนิกส์และสะสมแต้มส่งตรงเข้า LINE',
  qrCodeUrl: 'https://qr-official.line.me/gs/M_rubtang_GW.png',
  active: true,
  isConfigured: true,
};

let mockLineReceiptLogs: LineReceiptLog[] = [
  {
    id: 'log-demo-1',
    tenantId: 'demo-tenant',
    saleId: 'sale-demo-1',
    customerId: 'demo-cust-1',
    lineUserId: 'U_demo_somchai',
    receiptNumber: 'REC-260923-0101',
    status: 'SENT',
    flexPayload: {
      type: 'flex',
      altText: 'ใบเสร็จรับเงินอิเล็กทรอนิกส์ REC-260923-0101 (ร้านรับตังค์เดโม) ฿108.00',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#06C755',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: 'E-RECEIPT · ใบเสร็จรับเงินอิเล็กทรอนิกส์', color: '#dcfce7', size: 'xxs', weight: 'bold' },
            { type: 'text', text: 'ร้านรับตังค์เดโม', color: '#ffffff', size: 'lg', weight: 'bold', margin: 'sm' },
            { type: 'text', text: 'เลขที่: REC-260923-0101', color: '#f0fdf4', size: 'xs', margin: 'xs' },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'วันที่:', size: 'xxs', color: '#64748b', flex: 1 },
                { type: 'text', text: new Date().toLocaleString('th-TH'), size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'xs',
              contents: [
                { type: 'text', text: 'สาขา:', size: 'xxs', color: '#64748b', flex: 1 },
                { type: 'text', text: 'สาขาสุขุมวิท', size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
              ],
            },
            { type: 'separator', margin: 'md', color: '#e2e8f0' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  contents: [
                    { type: 'text', text: 'กาแฟอเมริกาโน่ × 2', size: 'xs', color: '#334155', flex: 4 },
                    { type: 'text', text: '฿110.00', size: 'xs', color: '#0f172a', flex: 2, align: 'end', weight: 'bold' },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  contents: [
                    { type: 'text', text: 'น้ำดื่ม 600 มล. × 1', size: 'xs', color: '#334155', flex: 4 },
                    { type: 'text', text: '฿10.00', size: 'xs', color: '#0f172a', flex: 2, align: 'end', weight: 'bold' },
                  ],
                },
              ],
            },
            { type: 'separator', margin: 'md', color: '#e2e8f0' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'รวมเงิน', size: 'xs', color: '#64748b' },
                { type: 'text', text: '฿120.00', size: 'xs', color: '#334155', align: 'end' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'xs',
              contents: [
                { type: 'text', text: 'ส่วนลด', size: 'xs', color: '#dc2626' },
                { type: 'text', text: '-฿12.00', size: 'xs', color: '#dc2626', align: 'end', weight: 'bold' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ยอดสุทธิ (Total)', size: 'md', weight: 'bold', color: '#0f172a' },
                { type: 'text', text: '฿108.00', size: 'xl', weight: 'bold', color: '#06C755', align: 'end' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'xs',
              contents: [
                { type: 'text', text: 'วิธีชำระ:', size: 'xxs', color: '#64748b' },
                { type: 'text', text: 'เงินสด (Cash)', size: 'xxs', color: '#475569', align: 'end', weight: 'bold' },
              ],
            },
            { type: 'separator', margin: 'md', color: '#e2e8f0' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'สมาชิก: คุณสมชาย ใจดี', size: 'xs', color: '#0284c7', weight: 'bold', flex: 2 },
                { type: 'text', text: '+10 แต้ม (คงเหลือ: 120)', size: 'xs', color: '#0284c7', align: 'end', weight: 'bold', flex: 3 },
              ],
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'ดูใบเสร็จฉบับเต็ม / PDF',
                uri: 'https://rubtang.pos/receipts/sale-demo-1',
              },
              style: 'primary',
              color: '#06C755',
              height: 'sm',
            },
            {
              type: 'text',
              text: 'ขอบคุณที่ใช้บริการ · จัดการโดย RubTang POS',
              size: 'xxs',
              color: '#94a3b8',
              align: 'center',
              margin: 'sm',
            },
          ],
        },
      },
    },
    errorMessage: null,
    sentAt: new Date(Date.now() - 3600000).toISOString(),
    customer: { id: 'demo-cust-1', name: 'คุณสมชาย ใจดี', phone: '0812345678', lineDisplayName: 'Somchai Jaidee' },
    sale: { id: 'sale-demo-1', receiptNumber: 'REC-260923-0101', total: '108.00', createdAt: new Date(Date.now() - 3600000).toISOString() },
  },
];


