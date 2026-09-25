import { ApiError, AuditActionDefinition, AuditLogItem, AuditLogListResponse, AuditLogMetrics, BranchPromptPay, BranchTaxSettings, Customer, LineOaSettings, LineReceiptLog, LoyaltyReward, NavigationMenuItem, PointLedgerItem, Position, Product, Profile, ReturnableItem, ReturnableSaleInfo, SaleHistoryItem, SaleReturn, SaleReturnItem, SaleReturnListItem, StockTakeDetail, StockTakeItem, StockTakeStatus, StockTakeSummary, SystemStatusDefinition, TaxInvoice } from './api';
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

const mockTables: Array<{
  id: string;
  branchId: string;
  number: string;
  name: string;
  zone: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  active: boolean;
  sessions: Array<{
    id: string;
    sessionToken: string;
    status: 'OPEN' | 'BILLED' | 'CLOSED' | 'CANCELLED';
    guestCount: number;
    note: string | null;
    openedAt: string;
    closedAt?: string;
    orders: Array<{
      id: string;
      orderNumber: string;
      status: 'PENDING' | 'COOKING' | 'SERVED' | 'CANCELLED';
      note: string | null;
      createdAt: string;
      items: Array<{
        id: string;
        productId: string;
        name: string;
        sku: string;
        price: number;
        quantity: number;
        subtotal: number;
        note?: string | null;
        createdAt: string;
      }>;
    }>;
  }>;
}> = [
  {
    id: 'table-1',
    branchId: 'demo-sukhumvit',
    number: 'T-01',
    name: 'โต๊ะ 1 (ริมหน้าต่าง)',
    zone: 'ห้องแอร์ (Indoor)',
    capacity: 4,
    status: 'OCCUPIED',
    active: true,
    sessions: [
      {
        id: 'sess-demo-01',
        sessionToken: 'tok_demo_table1_welcome',
        status: 'OPEN',
        guestCount: 2,
        note: 'ขอจานช้อนเพิ่ม',
        openedAt: new Date(Date.now() - 25 * 60000).toISOString(),
        orders: [
          {
            id: 'ord-demo-01',
            orderNumber: 'ORD-8901',
            status: 'COOKING',
            note: 'ไม่หวาน',
            createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
            items: [
              {
                id: 'item-01',
                productId: 'demo-product-2',
                name: 'กาแฟอเมริกาโน่',
                sku: 'COFFEE-001',
                price: 55,
                quantity: 2,
                subtotal: 110,
                note: 'ไม่หวานทั้ง 2 แก้ว',
                createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
              },
            ],
          },
          {
            id: 'ord-demo-02',
            orderNumber: 'ORD-8902',
            status: 'PENDING',
            note: null,
            createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
            items: [
              {
                id: 'item-02',
                productId: 'demo-product-1',
                name: 'น้ำดื่ม 600 มล.',
                sku: 'DRINK-001',
                price: 10,
                quantity: 2,
                subtotal: 20,
                note: 'ขอน้ำแข็งเปล่า 2 แก้ว',
                createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'table-2',
    branchId: 'demo-sukhumvit',
    number: 'T-02',
    name: 'โต๊ะ 2',
    zone: 'ห้องแอร์ (Indoor)',
    capacity: 2,
    status: 'AVAILABLE',
    active: true,
    sessions: [],
  },
  {
    id: 'table-3',
    branchId: 'demo-sukhumvit',
    number: 'T-03',
    name: 'โต๊ะ 3 (โซฟาใหญ่)',
    zone: 'ห้องแอร์ (Indoor)',
    capacity: 6,
    status: 'AVAILABLE',
    active: true,
    sessions: [],
  },
  {
    id: 'table-4',
    branchId: 'demo-sukhumvit',
    number: 'T-04',
    name: 'โต๊ะ 4',
    zone: 'ระเบียงสวน (Outdoor)',
    capacity: 4,
    status: 'AVAILABLE',
    active: true,
    sessions: [],
  },
  {
    id: 'table-5',
    branchId: 'demo-sukhumvit',
    number: 'T-05',
    name: 'โต๊ะ 5 (มุมสวน)',
    zone: 'ระเบียงสวน (Outdoor)',
    capacity: 4,
    status: 'AVAILABLE',
    active: true,
    sessions: [],
  },
  {
    id: 'table-6',
    branchId: 'demo-sukhumvit',
    number: 'VIP-01',
    name: 'ห้องรับรอง VIP',
    zone: 'ห้อง VIP',
    capacity: 10,
    status: 'AVAILABLE',
    active: true,
    sessions: [],
  },
];

const mockServices: Array<{
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  category: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  active: boolean;
  createdAt: string;
}> = [
  {
    id: 'svc-1',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    name: 'ตัดผมชาย + เซ็ตทรงพรีเมียม (Haircut & Styling)',
    category: 'ตัดผมและออกแบบทรง',
    description: 'สระผม ตัดผม ออกแบบทรง และเซ็ตทรงด้วยโพเมดนำเข้า',
    durationMinutes: 45,
    bufferMinutes: 10,
    price: 350,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svc-2',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    name: 'สระ-ไดร์ วอลลุ่ม (Wash & Blow-dry)',
    category: 'สระไดร์และทรีทเมนต์',
    description: 'สระผมด้วยแชมพูออร์แกนิก นวดผ่อนคลายศีรษะ และไดร์ยกโคนเพิ่มวอลลุ่ม',
    durationMinutes: 30,
    bufferMinutes: 5,
    price: 250,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svc-3',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    name: 'ดัดวอลลุ่มเกาหลี (Korean Perm)',
    category: 'เคมีและทำสี',
    description: 'ดัดผมสไตล์เกาหลี ดูแลง่าย ผมมีน้ำหนักไม่ลีบแบน น้ำยาเกรดพรีเมียมถนอมเส้นผม',
    durationMinutes: 90,
    bufferMinutes: 15,
    price: 1500,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svc-4',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    name: 'ทำสีผมแฟชั่น / ปิดผมขาว (Hair Coloring)',
    category: 'เคมีและทำสี',
    description: 'ทำสีผมโทนแฟชั่น หรือปิดผมขาวอย่างเป็นธรรมชาติ พร้อมมาร์กบำรุงผม',
    durationMinutes: 75,
    bufferMinutes: 15,
    price: 1200,
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svc-5',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    name: 'โกนหนวดจัดแต่งเครา + สปาผ้าร้อน (Shaving & Beard Grooming)',
    category: 'กรูมมิ่งและสปา',
    description: 'โกนหนวดประคบผ้าร้อน นวดน้ำมันอโรมา และบำรุงผิวหลังโกนหนวด',
    durationMinutes: 30,
    bufferMinutes: 10,
    price: 250,
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const mockBookingResources: Array<{
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  type: 'CHAIR' | 'ROOM' | 'STATION' | 'TABLE';
  description: string;
  active: boolean;
}> = [
  { id: 'res-1', tenantId: 'demo-tenant', branchId: 'demo-sukhumvit', name: 'เก้าอี้ตัดผม 01 (Master Chair)', type: 'CHAIR', description: 'เก้าอี้ตัดผมช่างใหญ่ แถวหน้า', active: true },
  { id: 'res-2', tenantId: 'demo-tenant', branchId: 'demo-sukhumvit', name: 'เก้าอี้ตัดผม 02', type: 'CHAIR', description: 'เก้าอี้ตัดผมมาตรฐาน โซนกลาง', active: true },
  { id: 'res-3', tenantId: 'demo-tenant', branchId: 'demo-sukhumvit', name: 'เตียงสระผม 01 (Shampoo Station)', type: 'STATION', description: 'เตียงสระระบบนวดไฟฟ้า', active: true },
  { id: 'res-4', tenantId: 'demo-tenant', branchId: 'demo-sukhumvit', name: 'ห้องทรีทเมนต์ VIP 01', type: 'ROOM', description: 'ห้องบริการส่วนตัว VIP ทำสีและสปาผม', active: true },
];

const mockBookingStaff: Array<{
  id: string;
  userId: string;
  displayName: string;
  position: string;
  role: string;
}> = [
  { id: 'staff-stylist-1', userId: 'user-stylist-1', displayName: 'ช่างเอก (Master Barber)', position: 'Master Barber / ช่างใหญ่', role: 'MANAGER' },
  { id: 'staff-stylist-2', userId: 'user-stylist-2', displayName: 'ช่างมายด์ (Senior Stylist)', position: 'Senior Hair Stylist', role: 'CASHIER' },
  { id: 'staff-stylist-3', userId: 'user-stylist-3', displayName: 'ช่างบอย (Color Specialist)', position: 'Color Specialist', role: 'CASHIER' },
];

const mockAppointments: Array<any> = [
  {
    id: 'app-demo-1',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    bookingCode: 'BK-890123',
    customerName: 'คุณสมชาย ใจดี',
    customerPhone: '0812345678',
    customerNote: 'ขอช่างเอก สระผมแบบเบามือ',
    customerId: 'demo-cust-1',
    serviceId: 'svc-1',
    service: mockServices[0],
    staffMembershipId: 'staff-stylist-1',
    staff: { id: 'staff-stylist-1', user: { displayName: 'ช่างเอก (Master Barber)' }, position: { name: 'Master Barber / ช่างใหญ่' } },
    resourceId: 'res-1',
    resource: mockBookingResources[0],
    bookingDate: new Date().toISOString().slice(0, 10),
    startTime: '11:00',
    endTime: '11:45',
    status: 'CONFIRMED',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'app-demo-2',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    bookingCode: 'BK-890124',
    customerName: 'คุณวิภา วงศ์สว่าง',
    customerPhone: '0899887766',
    customerNote: 'ย้อมผมปิดหงอก โทนน้ำตาลธรรมชาติ',
    customerId: 'demo-cust-2',
    serviceId: 'svc-4',
    service: mockServices[3],
    staffMembershipId: 'staff-stylist-3',
    staff: { id: 'staff-stylist-3', user: { displayName: 'ช่างบอย (Color Specialist)' }, position: { name: 'Color Specialist' } },
    resourceId: 'res-4',
    resource: mockBookingResources[3],
    bookingDate: new Date().toISOString().slice(0, 10),
    startTime: '13:00',
    endTime: '14:15',
    status: 'IN_SERVICE',
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'app-demo-3',
    tenantId: 'demo-tenant',
    branchId: 'demo-sukhumvit',
    bookingCode: 'BK-890125',
    customerName: 'คุณกิตติศักดิ์ พูลสวัสดิ์',
    customerPhone: '0865551234',
    customerNote: 'ตัดผมเปิดข้างวินเทจ',
    customerId: null,
    serviceId: 'svc-1',
    service: mockServices[0],
    staffMembershipId: 'staff-stylist-1',
    staff: { id: 'staff-stylist-1', user: { displayName: 'ช่างเอก (Master Barber)' }, position: { name: 'Master Barber / ช่างใหญ่' } },
    resourceId: 'res-1',
    resource: mockBookingResources[0],
    bookingDate: new Date().toISOString().slice(0, 10),
    startTime: '15:00',
    endTime: '15:45',
    status: 'CONFIRMED',
    createdAt: new Date(Date.now() - 10 * 3600000).toISOString(),
  },
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

  if (pathname === '/reports/vat') {
    const items = [
      {
        saleId: 'mock-s1',
        createdAt: new Date().toISOString(),
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        documentNumber: 'TAX-202609-001',
        invoiceType: 'FULL' as const,
        customerName: 'บริษัท ทีซีซี อินโนเวชั่น จำกัด',
        customerTaxId: '0105558123456',
        customerBranch: 'สนญ. (00000)',
        taxableAmount: 2000.0,
        vatAmount: 140.0,
        totalAmount: 2140.0,
      },
      {
        saleId: 'mock-s2',
        createdAt: new Date().toISOString(),
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        documentNumber: 'REC-SKH-00042',
        invoiceType: 'ABB' as const,
        customerName: 'ลูกค้ารายย่อย / หน้าร้าน',
        customerTaxId: '-',
        customerBranch: '-',
        taxableAmount: 467.29,
        vatAmount: 32.71,
        totalAmount: 500.0,
      },
    ];

    return {
      summary: {
        totalSalesCount: items.length,
        totalGrossSales: 2640.0,
        totalTaxableBase: 2467.29,
        totalOutputVat: 172.71,
        fullInvoiceCount: 1,
        abbCount: 1,
      },
      items,
    } as T;
  }

  if (pathname === '/reports/stock-card') {
    const items = [
      {
        id: 'mov-1',
        createdAt: new Date().toISOString(),
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        productId: 'demo-product-1',
        productName: 'เมล็ดกาแฟ อาราบิก้า 250g',
        sku: 'COFFEE-001',
        barcode: '8850123456789',
        type: 'SALE',
        quantity: -2,
        balanceBefore: 42,
        balanceAfter: 40,
        actorName: 'สมศรี มีทรัพย์ (แคชเชียร์)',
        note: 'ขายหน้าร้าน บิล REC-SKH-00042',
      },
      {
        id: 'mov-2',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        productId: 'demo-product-1',
        productName: 'เมล็ดกาแฟ อาราบิก้า 250g',
        sku: 'COFFEE-001',
        barcode: '8850123456789',
        type: 'PURCHASE',
        quantity: 20,
        balanceBefore: 22,
        balanceAfter: 42,
        actorName: 'สมชาย ผู้จัดการ',
        note: 'รับเข้าจากใบสั่งซื้อ PO-SKH-00012',
      },
    ];

    return {
      summary: {
        totalRecords: items.length,
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

  if (pathname === '/audits/definitions' && body === undefined) {
    return mockAuditDefinitions as T;
  }

  if (pathname.startsWith('/audits/definitions/') && body !== undefined) {
    const action = decodeURIComponent(pathname.replace('/audits/definitions/', ''));
    let found = mockAuditDefinitions.find(d => d.action === action);
    if (!found) {
      found = {
        id: `def-${Date.now()}`,
        action,
        label: String(input.label || action),
        category: String(input.category || 'OTHER'),
        severity: (input.severity as any) || 'INFO',
        description: input.description ? String(input.description) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockAuditDefinitions.push(found);
    } else {
      if (input.label) found.label = String(input.label);
      if (input.category) found.category = String(input.category);
      if (input.severity) found.severity = input.severity as any;
      if (input.description !== undefined) found.description = input.description ? String(input.description) : null;
      found.updatedAt = new Date().toISOString();
    }
    for (const audit of mockAudits) {
      if (audit.action === action) {
        audit.actionLabel = found.label;
        audit.category = found.category;
        audit.severity = found.severity;
      }
    }
    return found as T;
  }

  // SYSTEM STATUS DEFINITIONS
  if (pathname === '/system/statuses' && body === undefined) {
    const domain = query.get('domain');
    if (!domain || domain === 'ALL') {
      return mockSystemStatuses as T;
    }
    const filtered = mockSystemStatuses.filter(s => s.domain.toUpperCase() === domain.toUpperCase());
    return filtered as T;
  }

  if (pathname.startsWith('/system/statuses/') && body === undefined) {
    const parts = pathname.replace('/system/statuses/', '').split('/');
    if (parts.length === 2) {
      const [domain, code] = parts.map(decodeURIComponent);
      const found = mockSystemStatuses.find(
        s => s.domain.toUpperCase() === domain.toUpperCase() && s.code.toUpperCase() === code.toUpperCase()
      );
      if (!found) throw new ApiError(404, `ไม่พบสถานะ ${code} ในหมวด ${domain}`);
      return found as T;
    }
  }

  if (pathname.startsWith('/system/statuses/') && body !== undefined) {
    const parts = pathname.replace('/system/statuses/', '').split('/');
    if (parts.length === 2) {
      const [domain, code] = parts.map(decodeURIComponent);
      let found = mockSystemStatuses.find(
        s => s.domain.toUpperCase() === domain.toUpperCase() && s.code.toUpperCase() === code.toUpperCase()
      );
      if (!found) {
        found = {
          id: `st-custom-${Date.now()}`,
          domain: domain.toUpperCase(),
          code: code.toUpperCase(),
          label: String(input.label || code),
          color: input.color ? String(input.color) : null,
          bgColor: input.bgColor ? String(input.bgColor) : null,
          icon: input.icon ? String(input.icon) : null,
          sortOrder: input.sortOrder !== undefined ? Number(input.sortOrder) : 0,
          isTerminal: input.isTerminal !== undefined ? Boolean(input.isTerminal) : false,
          description: input.description ? String(input.description) : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockSystemStatuses.push(found);
      } else {
        if (input.label) found.label = String(input.label);
        if (input.color !== undefined) found.color = input.color ? String(input.color) : null;
        if (input.bgColor !== undefined) found.bgColor = input.bgColor ? String(input.bgColor) : null;
        if (input.icon !== undefined) found.icon = input.icon ? String(input.icon) : null;
        if (input.sortOrder !== undefined) found.sortOrder = Number(input.sortOrder);
        if (input.isTerminal !== undefined) found.isTerminal = Boolean(input.isTerminal);
        if (input.description !== undefined) found.description = input.description ? String(input.description) : null;
        found.updatedAt = new Date().toISOString();
      }
      return found as T;
    }
  }

  if (pathname.startsWith('/audits/') && body === undefined) {
    const id = pathname.replace('/audits/', '');
    const found = mockAudits.find(a => a.id === id);
    if (!found) throw new ApiError(404, 'ไม่พบบันทึกการตรวจสอบ');
    return found as T;
  }

  // NAVIGATION MENUS (RBAC)
  if (pathname === '/menus' && body === undefined) {
    const userRole = profile.role;
    return mockNavigationMenus.filter(m => m.active && m.allowedRoles.includes(userRole)) as T;
  }

  if (pathname === '/menus/manage' && body === undefined) {
    if (profile.role === 'CASHIER') throw new ApiError(403, 'ไม่มีสิทธิ์จัดการเมนู');
    return mockNavigationMenus as T;
  }

  if (pathname.startsWith('/menus/') && body !== undefined) {
    if (profile.role !== 'OWNER') throw new ApiError(403, 'เฉพาะเจ้าของร้านที่สามารถแก้ไขเมนูได้');
    const id = pathname.replace('/menus/', '');
    const menu = mockNavigationMenus.find(m => m.id === id);
    if (!menu) throw new ApiError(404, 'ไม่พบเมนูระบบ');
    const input = body as any;
    if (input.label !== undefined) menu.label = String(input.label);
    if (input.icon !== undefined) menu.icon = String(input.icon);
    if (input.sortOrder !== undefined) menu.sortOrder = Number(input.sortOrder);
    if (input.allowedRoles !== undefined) menu.allowedRoles = input.allowedRoles;
    if (input.active !== undefined) menu.active = Boolean(input.active);
    return menu as T;
  }

  // POSITIONS & RBAC PERMISSION MATRIX
  if (pathname === '/positions' && body === undefined) {
    return mockPositions.map(p => ({
      ...p,
      _count: {
        memberships: p.code === 'OWNER' ? 1 : p.code === 'CASHIER' ? 3 : 0,
        permissions: Object.values(mockPositionPermissions[p.id] || {}).filter(perm => perm.canView).length,
      },
    })) as T;
  }

  if (pathname === '/positions' && body !== undefined) {
    if (profile.role !== 'OWNER') throw new ApiError(403, 'เฉพาะเจ้าของร้านที่สามารถสร้างตำแหน่งงานได้');
    const input = body as any;
    const newPos: Position = {
      id: `pos-${Date.now()}`,
      code: String(input.code).toUpperCase().trim(),
      name: String(input.name).trim(),
      description: input.description ? String(input.description).trim() : null,
      isSystem: false,
      active: true,
      createdAt: new Date().toISOString(),
    };
    mockPositions.push(newPos);
    mockPositionPermissions[newPos.id] = {};
    for (const m of mockNavigationMenus) {
      mockPositionPermissions[newPos.id][m.id] = { canView: false, canExport: false };
    }
    return newPos as T;
  }

  if (pathname === '/positions/matrix' && body === undefined) {
    return {
      positions: mockPositions.filter(p => p.active).map(p => ({ id: p.id, code: p.code, name: p.name, isSystem: p.isSystem })),
      menus: mockNavigationMenus.filter(m => m.active),
      matrix: mockPositionPermissions,
    } as T;
  }

  if (pathname.startsWith('/positions/') && pathname.endsWith('/permissions') && body !== undefined) {
    if (profile.role !== 'OWNER') throw new ApiError(403, 'เฉพาะเจ้าของร้านที่สามารถปรับแก้สิทธิ์ได้');
    const posId = pathname.replace('/positions/', '').replace('/permissions', '');
    const input = body as { permissions: { menuId: string; canView: boolean; canExport?: boolean }[] };
    if (!mockPositionPermissions[posId]) mockPositionPermissions[posId] = {};
    for (const item of input.permissions) {
      mockPositionPermissions[posId][item.menuId] = {
        canView: item.canView,
        canExport: item.canExport ?? false,
      };
    }
    return { ok: true, count: input.permissions.length } as T;
  }

  if (pathname.startsWith('/positions/') && body !== undefined) {
    if (profile.role !== 'OWNER') throw new ApiError(403, 'เฉพาะเจ้าของร้านที่สามารถแก้ไขตำแหน่งได้');
    const id = pathname.replace('/positions/', '');
    const pos = mockPositions.find(p => p.id === id);
    if (!pos) throw new ApiError(404, 'ไม่พบตำแหน่งงาน');
    const input = body as any;
    if (input.name !== undefined) pos.name = String(input.name);
    if (input.description !== undefined) pos.description = input.description ? String(input.description) : null;
    if (input.active !== undefined) pos.active = Boolean(input.active);
    return pos as T;
  }

  if (pathname.startsWith('/staff/') && pathname.endsWith('/position') && body !== undefined) {
    if (profile.role !== 'OWNER') throw new ApiError(403, 'เฉพาะเจ้าของร้านที่สามารถกำหนดตำแหน่งพนักงานได้');
    return { ok: true } as T;
  }

  // ─── TABLES & DYNAMIC QR ORDERING ──────────────────────────────────────────
  if (pathname === '/tables' && body === undefined) {
    return mockTables.map(t => {
      const activeSession = t.sessions.find(s => s.status === 'OPEN') ?? null;
      let totalAmount = 0;
      let totalItems = 0;
      let pendingOrdersCount = 0;

      if (activeSession) {
        for (const order of activeSession.orders) {
          if (order.status === 'PENDING') pendingOrdersCount++;
          if (order.status !== 'CANCELLED') {
            for (const item of order.items) {
              totalItems += Number(item.quantity);
              totalAmount += Number(item.subtotal);
            }
          }
        }
      }

      return {
        id: t.id,
        number: t.number,
        name: t.name,
        zone: t.zone,
        capacity: t.capacity,
        status: activeSession ? 'OCCUPIED' : t.status,
        activeSession: activeSession
          ? {
              id: activeSession.id,
              sessionToken: activeSession.sessionToken,
              openedAt: activeSession.openedAt,
              guestCount: activeSession.guestCount,
              note: activeSession.note,
              totalAmount,
              totalItems,
              pendingOrdersCount,
              ordersCount: activeSession.orders.length,
            }
          : null,
      };
    }) as T;
  }

  if (pathname === '/tables' && body !== undefined) {
    const input = body as any;
    if (!input.number || !input.name) throw new ApiError(400, 'กรุณาระบุเลขโต๊ะและชื่อโต๊ะ');
    const newTable = {
      id: `table-demo-${Date.now()}`,
      branchId: input.branchId || 'demo-sukhumvit',
      number: String(input.number).trim(),
      name: String(input.name).trim(),
      zone: input.zone ? String(input.zone).trim() : 'ทั่วไป',
      capacity: Number(input.capacity) || 4,
      status: 'AVAILABLE' as const,
      active: true,
      sessions: [],
    };
    mockTables.push(newTable);
    return newTable as T;
  }

  if (pathname.startsWith('/tables/') && pathname.endsWith('/open-session') && body !== undefined) {
    const tableId = pathname.replace('/tables/', '').replace('/open-session', '');
    const table = mockTables.find(t => t.id === tableId);
    if (!table) throw new ApiError(404, 'ไม่พบโต๊ะอาหาร');

    let activeSession = table.sessions.find(s => s.status === 'OPEN');
    if (!activeSession) {
      const input = (body || {}) as any;
      const token = `tok_demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      activeSession = {
        id: `sess-demo-${Date.now()}`,
        sessionToken: token,
        status: 'OPEN',
        guestCount: Number(input.guestCount) || 2,
        note: input.note ? String(input.note) : null,
        openedAt: new Date().toISOString(),
        orders: [],
      };
      table.sessions.push(activeSession);
      table.status = 'OCCUPIED';
    }

    return {
      session: activeSession,
      table: { id: table.id, number: table.number, name: table.name, zone: table.zone },
      orderUrl: `/order?token=${activeSession.sessionToken}`,
    } as T;
  }

  if (pathname.startsWith('/tables/sessions/') && pathname.endsWith('/close') && body !== undefined) {
    const sessionId = pathname.replace('/tables/sessions/', '').replace('/close', '');
    const input = (body || {}) as any;
    for (const t of mockTables) {
      const sess = t.sessions.find(s => s.id === sessionId);
      if (sess) {
        sess.status = input.saleId ? 'CLOSED' : 'CANCELLED';
        sess.closedAt = new Date().toISOString();
        if (!t.sessions.some(s => s.status === 'OPEN')) {
          t.status = 'AVAILABLE';
        }
        return { ok: true, session: sess } as T;
      }
    }
    throw new ApiError(404, 'ไม่พบรอบการใช้งานโต๊ะ');
  }

  if (pathname.startsWith('/tables/sessions/') && body === undefined) {
    const sessionId = pathname.replace('/tables/sessions/', '');
    for (const t of mockTables) {
      const sess = t.sessions.find(s => s.id === sessionId);
      if (sess) {
        let subtotal = 0;
        const aggregatedItems: Record<string, any> = {};
        for (const order of sess.orders) {
          if (order.status !== 'CANCELLED') {
            for (const item of order.items) {
              const qty = Number(item.quantity);
              const price = Number(item.price);
              const itemSub = Number(item.subtotal);
              subtotal += itemSub;
              if (!aggregatedItems[item.productId]) {
                aggregatedItems[item.productId] = { ...item, quantity: qty, subtotal: itemSub };
              } else {
                aggregatedItems[item.productId].quantity += qty;
                aggregatedItems[item.productId].subtotal += itemSub;
              }
            }
          }
        }

        return {
          session: sess,
          table: { id: t.id, number: t.number, name: t.name, zone: t.zone, capacity: t.capacity },
          orders: sess.orders,
          aggregatedItems: Object.values(aggregatedItems),
          subtotal,
        } as T;
      }
    }
    throw new ApiError(404, 'ไม่พบข้อมูลรอบโต๊ะ');
  }

  if (pathname.startsWith('/tables/orders/') && pathname.endsWith('/status') && body !== undefined) {
    const orderId = pathname.replace('/tables/orders/', '').replace('/status', '');
    const input = body as any;
    for (const t of mockTables) {
      for (const s of t.sessions) {
        const order = s.orders.find(o => o.id === orderId);
        if (order) {
          order.status = input.status;
          return { ok: true, order } as T;
        }
      }
    }
    throw new ApiError(404, 'ไม่พบออเดอร์');
  }

  if (pathname.startsWith('/public/table-order/session/') && pathname.endsWith('/order') && body !== undefined) {
    const token = pathname.replace('/public/table-order/session/', '').replace('/order', '');
    const input = body as any;
    for (const t of mockTables) {
      const sess = t.sessions.find(s => s.sessionToken === decodeURIComponent(token));
      if (sess) {
        if (sess.status !== 'OPEN') throw new ApiError(400, 'รอบโต๊ะนี้ถูกปิดหรือเช็คบิลแล้ว');
        const items = (input.items || []).map((i: any) => {
          const prod = products.find(p => p.id === i.productId);
          const price = prod ? Number(prod.price) : 50;
          const qty = Number(i.quantity) || 1;
          return {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            productId: i.productId,
            name: prod?.name || 'รายการอาหาร',
            sku: prod?.sku || 'SKU',
            price,
            quantity: qty,
            subtotal: price * qty,
            note: i.note || null,
            createdAt: new Date().toISOString(),
          };
        });

        const newOrder = {
          id: `ord-${Date.now()}`,
          orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
          status: 'PENDING' as const,
          note: input.note || null,
          createdAt: new Date().toISOString(),
          items,
        };
        sess.orders.push(newOrder);
        return { success: true, order: newOrder, message: 'ส่งออเดอร์เข้าครัวเรียบร้อยแล้ว!' } as T;
      }
    }
    throw new ApiError(404, 'ไม่พบโต๊ะอาหาร');
  }

  if (pathname.startsWith('/public/table-order/session/') && pathname.endsWith('/status') && body === undefined) {
    const token = pathname.replace('/public/table-order/session/', '').replace('/status', '');
    for (const t of mockTables) {
      const sess = t.sessions.find(s => s.sessionToken === decodeURIComponent(token));
      if (sess) {
        let runningTotal = 0;
        for (const o of sess.orders) {
          if (o.status !== 'CANCELLED') {
            for (const i of o.items) runningTotal += Number(i.subtotal);
          }
        }
        return { status: sess.status, table: { id: t.id, number: t.number, name: t.name }, orders: sess.orders, runningTotal } as T;
      }
    }
    throw new ApiError(404, 'ไม่พบโต๊ะอาหาร');
  }

  if (pathname.startsWith('/public/table-order/session/') && body === undefined) {
    const token = decodeURIComponent(pathname.replace('/public/table-order/session/', ''));
    for (const t of mockTables) {
      const sess = t.sessions.find(s => s.sessionToken === token);
      if (sess) {
        let runningTotal = 0;
        let itemCount = 0;
        for (const o of sess.orders) {
          if (o.status !== 'CANCELLED') {
            for (const i of o.items) {
              runningTotal += Number(i.subtotal);
              itemCount += Number(i.quantity);
            }
          }
        }

        return {
          expired: sess.status !== 'OPEN',
          message: sess.status !== 'OPEN' ? 'รอบโต๊ะนี้ได้ถูกปิดหรือเช็คบิลเรียบร้อยแล้ว' : undefined,
          session: {
            id: sess.id,
            sessionToken: sess.sessionToken,
            openedAt: sess.openedAt,
            guestCount: sess.guestCount,
          },
          table: { id: t.id, number: t.number, name: t.name, zone: t.zone },
          branch: { id: 'demo-sukhumvit', name: 'สาขาสุขุมวิท', phone: '02-123-4567' },
          tenant: { id: 'demo-tenant', name: 'ร้านรับตังค์เดโม' },
          menu: products.filter(p => p.active).map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            price: Number(p.price),
            inStock: Number(p.quantity) > 0,
            stockQuantity: Number(p.quantity),
          })),
          orders: sess.orders,
          runningTotal,
          itemCount,
        } as T;
      }
    }
    throw new ApiError(404, 'ไม่พบโต๊ะอาหารหรือ QR Code หมดอายุ');
  }

  // ─── Service & Appointment Booking ──────────────────────────────────────────
  if (pathname === '/services' && body === undefined) {
    return mockServices.filter(s => s.active) as T;
  }

  if (pathname === '/services' && body !== undefined) {
    const input = body as any;
    if (!input.name || !input.durationMinutes || input.price === undefined) {
      throw new ApiError(400, 'กรุณากรอกข้อมูลบริการให้ครบถ้วน');
    }
    const newSvc = {
      id: `svc-${Date.now()}`,
      tenantId: 'demo-tenant',
      branchId: input.branchId || 'demo-sukhumvit',
      name: String(input.name).trim(),
      category: input.category ? String(input.category).trim() : 'บริการทั่วไป',
      description: input.description ? String(input.description).trim() : '',
      durationMinutes: Number(input.durationMinutes) || 30,
      bufferMinutes: Number(input.bufferMinutes) || 0,
      price: Number(input.price) || 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    mockServices.push(newSvc);
    return newSvc as T;
  }

  if (pathname.startsWith('/services/') && body !== undefined) {
    const svcId = pathname.replace('/services/', '');
    const svc = mockServices.find(s => s.id === svcId);
    if (!svc) throw new ApiError(404, 'ไม่พบบริการนี้');
    const input = body as any;
    if (input.name !== undefined) svc.name = String(input.name).trim();
    if (input.category !== undefined) svc.category = String(input.category).trim();
    if (input.description !== undefined) svc.description = String(input.description).trim();
    if (input.durationMinutes !== undefined) svc.durationMinutes = Number(input.durationMinutes);
    if (input.bufferMinutes !== undefined) svc.bufferMinutes = Number(input.bufferMinutes);
    if (input.price !== undefined) svc.price = Number(input.price);
    if (input.active !== undefined) svc.active = Boolean(input.active);
    return svc as T;
  }

  if (pathname === '/booking/resources' && body === undefined) {
    return mockBookingResources.filter(r => r.active) as T;
  }

  if (pathname === '/booking/resources' && body !== undefined) {
    const input = body as any;
    if (!input.name) throw new ApiError(400, 'กรุณาระบุชื่อเก้าอี้/ห้องบริการ');
    const newRes = {
      id: `res-${Date.now()}`,
      tenantId: 'demo-tenant',
      branchId: input.branchId || 'demo-sukhumvit',
      name: String(input.name).trim(),
      type: input.type || 'CHAIR',
      description: input.description ? String(input.description).trim() : '',
      active: true,
    };
    mockBookingResources.push(newRes);
    return newRes as T;
  }

  if (pathname === '/booking/staff' && body === undefined) {
    return mockBookingStaff as T;
  }

  if (pathname === '/appointments' && body === undefined) {
    const dateParam = query.get('date');
    const statusParam = query.get('status');
    let list = [...mockAppointments];
    if (dateParam) {
      list = list.filter(a => a.bookingDate === dateParam);
    }
    if (statusParam) {
      list = list.filter(a => a.status === statusParam);
    }
    list.sort((a, b) => {
      const cmpDate = a.bookingDate.localeCompare(b.bookingDate);
      if (cmpDate !== 0) return cmpDate;
      return a.startTime.localeCompare(b.startTime);
    });
    return list as T;
  }

  if (pathname === '/appointments' && body !== undefined) {
    const input = body as any;
    if (!input.customerName || !input.customerPhone || !input.serviceId || !input.bookingDate || !input.startTime) {
      throw new ApiError(400, 'กรุณากรอกข้อมูลการจองให้ครบถ้วน');
    }
    const service = mockServices.find(s => s.id === input.serviceId) || mockServices[0];
    const [startH, startM] = input.startTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + (service?.durationMinutes || 30);
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const staff = mockBookingStaff.find(s => s.id === input.staffMembershipId);
    const resource = mockBookingResources.find(r => r.id === input.resourceId);

    const newApp = {
      id: `app-${Date.now()}`,
      tenantId: 'demo-tenant',
      branchId: input.branchId || 'demo-sukhumvit',
      bookingCode: `BK-${Date.now().toString().slice(-6)}`,
      customerName: String(input.customerName).trim(),
      customerPhone: String(input.customerPhone).trim(),
      customerNote: input.customerNote ? String(input.customerNote).trim() : null,
      customerId: input.customerId || null,
      serviceId: service.id,
      service,
      staffMembershipId: staff?.id || null,
      staff: staff ? { id: staff.id, user: { displayName: staff.displayName }, position: { name: staff.position } } : null,
      resourceId: resource?.id || null,
      resource: resource ? { id: resource.id, name: resource.name, type: resource.type } : null,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime,
      status: input.status || 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };
    mockAppointments.push(newApp);
    return newApp as T;
  }

  if (pathname.startsWith('/appointments/') && pathname.endsWith('/status') && body !== undefined) {
    const appId = pathname.replace('/appointments/', '').replace('/status', '');
    const input = body as any;
    const app = mockAppointments.find(a => a.id === appId);
    if (!app) throw new ApiError(404, 'ไม่พบคิวนัดหมายนี้');
    app.status = input.status;
    if (input.saleId) app.saleId = input.saleId;
    return app as T;
  }

  if (pathname === '/booking/availability' && body === undefined) {
    const serviceId = query.get('serviceId') || mockServices[0].id;
    const date = query.get('date') || new Date().toISOString().slice(0, 10);
    const staffId = query.get('staffId');
    const service = mockServices.find(s => s.id === serviceId) || mockServices[0];

    const allSlots = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
    const busyAppointments = mockAppointments.filter(a => {
      if (a.bookingDate !== date) return false;
      if (['CANCELLED', 'NO_SHOW'].includes(a.status)) return false;
      if (staffId && a.staffMembershipId && a.staffMembershipId !== staffId) return false;
      return true;
    });

    const availableSlots = allSlots.filter(slot => {
      const [sH, sM] = slot.split(':').map(Number);
      const slotStart = sH * 60 + sM;
      const slotEnd = slotStart + service.durationMinutes;

      const overlap = busyAppointments.some(a => {
        const [aStartH, aStartM] = a.startTime.split(':').map(Number);
        const [aEndH, aEndM] = a.endTime.split(':').map(Number);
        const appStart = aStartH * 60 + aStartM;
        const appEnd = aEndH * 60 + aEndM;
        return slotStart < appEnd && slotEnd > appStart;
      });

      return !overlap;
    });

    return {
      service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes, price: service.price },
      date,
      availableSlots,
    } as T;
  }

  if (pathname.startsWith('/public/booking/info/') && body === undefined) {
    return {
      branch: {
        id: 'demo-sukhumvit',
        name: 'สาขาสุขุมวิท (สุขุมวิท 24)',
        phone: '02-123-4567',
        address: '123/45 สุขุมวิท 24 แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110',
      },
      tenant: {
        id: 'demo-tenant',
        name: 'ร้านรับตังค์ บาร์เบอร์ & ซาลอน (RubTang Barber & Salon)',
      },
      services: mockServices.filter(s => s.active).map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        durationMinutes: s.durationMinutes,
        price: s.price,
      })),
      staff: mockBookingStaff.map(s => ({
        id: s.id,
        displayName: s.displayName,
        title: s.position,
      })),
    } as T;
  }

  if (pathname.startsWith('/public/booking/availability/') && body === undefined) {
    const serviceId = query.get('serviceId') || mockServices[0].id;
    const date = query.get('date') || new Date().toISOString().slice(0, 10);
    const staffId = query.get('staffId');
    const service = mockServices.find(s => s.id === serviceId) || mockServices[0];

    const allSlots = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
    const busyAppointments = mockAppointments.filter(a => {
      if (a.bookingDate !== date) return false;
      if (['CANCELLED', 'NO_SHOW'].includes(a.status)) return false;
      if (staffId && a.staffMembershipId && a.staffMembershipId !== staffId) return false;
      return true;
    });

    const availableSlots = allSlots.filter(slot => {
      const [sH, sM] = slot.split(':').map(Number);
      const slotStart = sH * 60 + sM;
      const slotEnd = slotStart + service.durationMinutes;

      const overlap = busyAppointments.some(a => {
        const [aStartH, aStartM] = a.startTime.split(':').map(Number);
        const [aEndH, aEndM] = a.endTime.split(':').map(Number);
        const appStart = aStartH * 60 + aStartM;
        const appEnd = aEndH * 60 + aEndM;
        return slotStart < appEnd && slotEnd > appStart;
      });

      return !overlap;
    });

    return {
      service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes, price: service.price },
      date,
      availableSlots,
    } as T;
  }

  if (pathname.startsWith('/public/booking/submit/') && body !== undefined) {
    const input = body as any;
    if (!input.customerName || !input.customerPhone || !input.serviceId || !input.bookingDate || !input.startTime) {
      throw new ApiError(400, 'กรุณากรอกข้อมูลการจองให้ครบถ้วน');
    }
    const service = mockServices.find(s => s.id === input.serviceId) || mockServices[0];
    const [startH, startM] = input.startTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + (service?.durationMinutes || 30);
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const staff = mockBookingStaff.find(s => s.id === input.staffMembershipId);

    const bookingCode = `BK-${Date.now().toString().slice(-6)}`;
    const newApp = {
      id: `app-${Date.now()}`,
      tenantId: 'demo-tenant',
      branchId: 'demo-sukhumvit',
      bookingCode,
      customerName: String(input.customerName).trim(),
      customerPhone: String(input.customerPhone).trim(),
      customerNote: input.customerNote ? String(input.customerNote).trim() : null,
      customerId: null,
      serviceId: service.id,
      service,
      staffMembershipId: staff?.id || null,
      staff: staff ? { id: staff.id, user: { displayName: staff.displayName }, position: { name: staff.position } } : null,
      resourceId: 'res-1',
      resource: mockBookingResources[0],
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };
    mockAppointments.unshift(newApp);
    return {
      success: true,
      bookingCode,
      appointment: newApp,
      message: 'จองคิวนัดหมายสำเร็จ! กรุณามาถึงก่อนเวลา 5-10 นาทีครับ',
    } as T;
  }

  if (pathname.startsWith('/public/booking/status/') && body === undefined) {
    const code = decodeURIComponent(pathname.replace('/public/booking/status/', ''));
    const app = mockAppointments.find(a => a.bookingCode === code);
    if (!app) throw new ApiError(404, 'ไม่พบข้อมูลการจองนี้');
    return app as T;
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
      lowStockAlertEnabled: input.lowStockAlertEnabled !== undefined ? Boolean(input.lowStockAlertEnabled) : mockLineSettings.lowStockAlertEnabled,
      lowStockThreshold: input.lowStockThreshold !== undefined ? Number(input.lowStockThreshold) : mockLineSettings.lowStockThreshold,
      lowStockTargetUserId: stringValue(input.lowStockTargetUserId) || mockLineSettings.lowStockTargetUserId,
      isConfigured: Boolean(input.channelAccessToken && String(input.channelAccessToken).length > 5),
    };
    return mockLineSettings as T;
  }

  if (pathname === '/line/low-stock/preview' && body === undefined) {
    const threshold = query.get('threshold') ? parseInt(query.get('threshold')!, 10) : (mockLineSettings.lowStockThreshold || 5);
    const lowStockItems = products
      .filter(p => p.active && Number(p.quantity) <= threshold)
      .map(p => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        branchId: 'demo-sukhumvit',
        branchName: 'สาขาสุขุมวิท',
        quantity: Number(p.quantity),
        reorderPoint: threshold,
        price: Number(p.price),
      }));

    return {
      threshold,
      branchId: 'demo-sukhumvit',
      branchName: 'สาขาสุขุมวิท',
      items: lowStockItems,
      totalCount: lowStockItems.length,
      outOfStockCount: lowStockItems.filter(i => i.quantity <= 0).length,
      flexMessage: {
        type: 'flex',
        altText: `⚠️ แจ้งเตือนสินค้าใกล้หมด ${lowStockItems.length} รายการ (สาขาสุขุมวิท)`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            backgroundColor: '#dc2626',
            contents: [
              { type: 'text', text: '⚠️ LOW STOCK ALERT · แจ้งเตือนสินค้าใกล้หมด', color: '#fee2e2' },
              { type: 'text', text: profile.tenant.name, color: '#ffffff', size: 'lg', weight: 'bold' },
            ],
          },
        },
      },
      settings: {
        lowStockAlertEnabled: mockLineSettings.lowStockAlertEnabled ?? true,
        lowStockThreshold: mockLineSettings.lowStockThreshold ?? 5,
        lowStockTargetUserId: mockLineSettings.lowStockTargetUserId ?? 'U_demo_manager_line_user',
        lowStockLastAlertAt: mockLineSettings.lowStockLastAlertAt ?? null,
      },
    } as T;
  }

  if (pathname === '/line/low-stock/send' && body !== undefined) {
    const targetUserId = stringValue(input.targetLineUserId) || mockLineSettings.lowStockTargetUserId || 'U_demo_manager_line_user';
    mockLineSettings.lowStockLastAlertAt = new Date().toISOString();
    const threshold = Number(input.threshold) || mockLineSettings.lowStockThreshold || 5;
    const items = products.filter(p => p.active && Number(p.quantity) <= threshold);

    return {
      success: true,
      count: items.length,
      targetUserId,
      status: 'SENT',
      message: `ส่งการแจ้งเตือนสินค้าใกล้หมด ${items.length} รายการ ไปยัง LINE (${targetUserId}) สำเร็จ`,
      flexMessage: {},
    } as T;
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

const mockAuditDefinitions: AuditActionDefinition[] = [
  { id: 'def-1', action: 'TENANT_CREATED', label: 'สร้างร้านค้าใหม่', category: 'ADMIN', severity: 'INFO', description: 'สร้างข้อมูลองค์กรหรือร้านค้าหลักใหม่' },
  { id: 'def-2', action: 'BRANCH_CREATED', label: 'เพิ่มสาขาใหม่', category: 'ADMIN', severity: 'INFO', description: 'สร้างสาขาใหม่ในระบบ' },
  { id: 'def-3', action: 'STAFF_INVITED', label: 'เพิ่ม/เชิญพนักงาน', category: 'ADMIN', severity: 'WARNING', description: 'เชิญหรือมอบหมายสิทธิ์ให้พนักงานใหม่' },
  { id: 'def-4', action: 'LINE_SETTINGS_UPDATED', label: 'แก้ไขการตั้งค่า LINE OA', category: 'ADMIN', severity: 'INFO', description: 'อัปเดต Channel Secret หรือ Access Token' },
  { id: 'def-5', action: 'PRODUCT_CREATED', label: 'สร้างรายการสินค้า', category: 'CATALOG', severity: 'INFO', description: 'เพิ่มสินค้าใหม่เข้าแคตตาล็อก' },
  { id: 'def-6', action: 'PRODUCT_UPDATED', label: 'แก้ไขข้อมูลสินค้า/ราคา', category: 'CATALOG', severity: 'INFO', description: 'แก้ไขชื่อ ราคา บาร์โค้ด หรือรายละเอียดสินค้า' },
  { id: 'def-7', action: 'STOCK_MOVEMENT_CREATED', label: 'รับเข้า/ปรับยอดสต็อก', category: 'INVENTORY', severity: 'WARNING', description: 'ปรับยอดคงเหลือสต็อกหรือรับสินค้าเข้าคลัง' },
  { id: 'def-8', action: 'TRANSFER_INITIATED', label: 'เปิดใบโอนสินค้า', category: 'INVENTORY', severity: 'INFO', description: 'สร้างเอกสารขอโอนย้ายสินค้าระหว่างสาขา' },
  { id: 'def-9', action: 'TRANSFER_COMPLETED', label: 'รับสินค้าโอนเข้าสาขา', category: 'INVENTORY', severity: 'INFO', description: 'ปลายทางกดยืนยันรับสินค้าที่โอนมา' },
  { id: 'def-10', action: 'TRANSFER_CANCELLED', label: 'ยกเลิกใบโอนสินค้า', category: 'INVENTORY', severity: 'WARNING', description: 'ยกเลิกคำขอโอนย้ายสินค้า' },
  { id: 'def-11', action: 'STOCK_TAKE_STARTED', label: 'เปิดรอบตรวจนับสต็อก', category: 'INVENTORY', severity: 'INFO', description: 'เปิดรอบนับสต็อกสินค้าประจำงวด' },
  { id: 'def-12', action: 'STOCK_TAKE_APPROVED', label: 'อนุมัติกระทบยอดสต็อก', category: 'INVENTORY', severity: 'WARNING', description: 'อนุมัติปรับยอดคงเหลือตามผลการตรวจนับจริง' },
  { id: 'def-13', action: 'STOCK_TAKE_CANCELLED', label: 'ยกเลิกรอบตรวจนับสต็อก', category: 'INVENTORY', severity: 'WARNING', description: 'ยกเลิกรอบตรวจนับสินค้า' },
  { id: 'def-14', action: 'SHIFT_OPENED', label: 'เปิดกะเงินสด', category: 'SHIFT', severity: 'INFO', description: 'เริ่มต้นกะขายและบันทึกเงินทอนเริ่มต้น' },
  { id: 'def-15', action: 'SHIFT_CLOSED', label: 'ปิดกะเงินสดและส่งยอด', category: 'SHIFT', severity: 'INFO', description: 'สิ้นสุดกะขายและกระทบยอดเงินสดจริง' },
  { id: 'def-16', action: 'SALE_COMPLETED', label: 'บันทึกการขาย', category: 'SALES', severity: 'INFO', description: 'ชำระเงินและออกใบเสร็จรับเงินสำเร็จ' },
  { id: 'def-17', action: 'SALE_VOIDED', label: 'ยกเลิกบิลขาย (Void)', category: 'SALES', severity: 'CRITICAL', description: 'ยกเลิกรายการขาย คืนยอดสต็อกและรายได้' },
  { id: 'def-18', action: 'SALE_RETURN_CREATED', label: 'คืนสินค้า/ออกใบลดหนี้', category: 'SALES', severity: 'WARNING', description: 'รับคืนสินค้าบางส่วนหรือเต็มบิล พร้อมคืนเงินลูกค้า' },
  { id: 'def-19', action: 'LINE_RECEIPT_SENT', label: 'ส่ง E-Receipt เข้า LINE', category: 'SALES', severity: 'INFO', description: 'ส่งใบเสร็จอิเล็กทรอนิกส์เข้า LINE OA สำเร็จ' },
  { id: 'def-20', action: 'PROMOTION_CREATED', label: 'สร้างโปรโมชัน/คูปอง', category: 'MARKETING', severity: 'INFO', description: 'สร้างแคมเปญส่วนลดหรือคูปองใหม่' },
  { id: 'def-21', action: 'COUPON_REDEEMED', label: 'ใช้คูปองส่วนลด', category: 'MARKETING', severity: 'INFO', description: 'นำคูปองมาใช้เป็นส่วนลดในการซื้อสินค้า' },
  { id: 'def-22', action: 'POINTS_ADJUSTED', label: 'ปรับแต้มสะสมสมาชิก', category: 'MARKETING', severity: 'WARNING', description: 'ปรับเพิ่มหรือลดยอดแต้มสะสมของลูกค้าด้วยตนเอง' },
  { id: 'def-23', action: 'LINE_CUSTOMER_LINKED', label: 'ผูกบัญชี LINE สมาชิก', category: 'MARKETING', severity: 'INFO', description: 'ลูกค้าผูกบัญชี LINE เข้ากับเบอร์โทรสมาชิกร้าน' },
  { id: 'def-24', action: 'LINE_CUSTOMER_UNLINKED', label: 'ยกเลิกผูกบัญชี LINE สมาชิก', category: 'MARKETING', severity: 'INFO', description: 'ยกเลิกการเชื่อมโยงบัญชี LINE กับสมาชิกร้าน' },
  { id: 'def-25', action: 'SUPPLIER_CREATED', label: 'เพิ่มผู้จำหน่าย', category: 'PROCUREMENT', severity: 'INFO', description: 'เพิ่มข้อมูลคู่ค้า/ซัพพลายเออร์ใหม่' },
  { id: 'def-26', action: 'PURCHASE_ORDER_CREATED', label: 'สร้างใบสั่งซื้อ (PO)', category: 'PROCUREMENT', severity: 'INFO', description: 'สร้างเอกสารสั่งซื้อสินค้าจากซัพพลายเออร์' },
  { id: 'def-27', action: 'PURCHASE_ORDER_RECEIVED', label: 'รับสินค้าตามใบสั่งซื้อ', category: 'PROCUREMENT', severity: 'INFO', description: 'รับสินค้าเข้าคลังตามเอกสารสั่งซื้อ' },
];

const mockSystemStatuses: SystemStatusDefinition[] = [
  // TransferStatus
  { id: 'st-tr-1', domain: 'TRANSFER', code: 'IN_TRANSIT', label: 'กำลังขนส่ง', color: '#a36600', bgColor: '#fff5df', icon: 'Truck', sortOrder: 1, isTerminal: false, description: 'สินค้าอยู่ระหว่างการจัดส่งไปยังสาขาปลายทาง' },
  { id: 'st-tr-2', domain: 'TRANSFER', code: 'COMPLETED', label: 'รับสินค้าแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 2, isTerminal: true, description: 'สาขาปลายทางกดยืนยันรับสินค้าเข้าคลังแล้ว' },
  { id: 'st-tr-3', domain: 'TRANSFER', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 3, isTerminal: true, description: 'ยกเลิกใบโอนสินค้าระหว่างสาขา' },

  // SaleStatus
  { id: 'st-sl-1', domain: 'SALE', code: 'COMPLETED', label: 'สำเร็จ', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 1, isTerminal: false, description: 'ชำระเงินและออกใบเสร็จรับเงินสำเร็จ' },
  { id: 'st-sl-2', domain: 'SALE', code: 'PARTIALLY_RETURNED', label: 'คืนสินค้าบางส่วน', color: '#a36600', bgColor: '#fff5df', icon: 'RotateCcw', sortOrder: 2, isTerminal: false, description: 'มีการรับคืนสินค้าบางรายการในบิล' },
  { id: 'st-sl-3', domain: 'SALE', code: 'VOIDED', label: 'ยกเลิกบิล (Void)', color: '#c23f45', bgColor: '#fff1f2', icon: 'Ban', sortOrder: 3, isTerminal: true, description: 'ยกเลิกรายการขายและคืนยอดเงินเต็มจำนวน' },

  // ShiftStatus
  { id: 'st-sh-1', domain: 'SHIFT', code: 'OPEN', label: 'เปิดกะอยู่', color: '#16825d', bgColor: '#e8f5ed', icon: 'LockOpen', sortOrder: 1, isTerminal: false, description: 'กะเงินสดเปิดทำงานและบันทึกยอดขายอยู่' },
  { id: 'st-sh-2', domain: 'SHIFT', code: 'CLOSED', label: 'ปิดกะแล้ว', color: '#64748b', bgColor: '#f1f5f9', icon: 'Lock', sortOrder: 2, isTerminal: true, description: 'ปิดกะขายและส่งยอดเงินสดเรียบร้อยแล้ว' },

  // PurchaseOrderStatus
  { id: 'st-po-1', domain: 'PURCHASE_ORDER', code: 'DRAFT', label: 'แบบร่าง', color: '#64748b', bgColor: '#f1f5f9', icon: 'FileText', sortOrder: 1, isTerminal: false, description: 'ร่างเอกสารสั่งซื้อสินค้า ยังไม่ส่งให้คู่ค้า' },
  { id: 'st-po-2', domain: 'PURCHASE_ORDER', code: 'ORDERED', label: 'สั่งซื้อแล้ว', color: '#0284c7', bgColor: '#e0f2fe', icon: 'Send', sortOrder: 2, isTerminal: false, description: 'ยืนยันใบสั่งซื้อและส่งให้ซัพพลายเออร์แล้ว' },
  { id: 'st-po-3', domain: 'PURCHASE_ORDER', code: 'PARTIALLY_RECEIVED', label: 'รับสินค้าบางส่วน', color: '#a36600', bgColor: '#fff5df', icon: 'Clock', sortOrder: 3, isTerminal: false, description: 'สินค้าทยอยส่งมอบเข้าคลังบางรายการ' },
  { id: 'st-po-4', domain: 'PURCHASE_ORDER', code: 'RECEIVED', label: 'รับสินค้าครบแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 4, isTerminal: true, description: 'รับสินค้าเข้าคลังครบถ้วนตามใบสั่งซื้อ' },
  { id: 'st-po-5', domain: 'PURCHASE_ORDER', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 5, isTerminal: true, description: 'ยกเลิกใบสั่งซื้อสินค้า' },

  // StockTakeStatus
  { id: 'st-st-1', domain: 'STOCK_TAKE', code: 'IN_PROGRESS', label: 'กำลังตรวจนับ', color: '#a36600', bgColor: '#fff5df', icon: 'Clock', sortOrder: 1, isTerminal: false, description: 'อยู่ระหว่างการนับสินค้าและบันทึกยอดตรวจนับ' },
  { id: 'st-st-2', domain: 'STOCK_TAKE', code: 'COMPLETED', label: 'ปรับยอดแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'CheckCircle2', sortOrder: 2, isTerminal: true, description: 'อนุมัติผลการตรวจนับและปรับปรุงยอดสต็อกแล้ว' },
  { id: 'st-st-3', domain: 'STOCK_TAKE', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 3, isTerminal: true, description: 'ยกเลิกรอบการตรวจนับสต็อกสินค้า' },

  // TaxInvoiceStatus
  { id: 'st-tx-1', domain: 'TAX_INVOICE', code: 'ISSUED', label: 'ออกเอกสารแล้ว', color: '#16825d', bgColor: '#e8f5ed', icon: 'FileCheck', sortOrder: 1, isTerminal: false, description: 'ออกใบกำกับภาษีอย่างเต็มรูปสำเร็จ' },
  { id: 'st-tx-2', domain: 'TAX_INVOICE', code: 'CANCELLED', label: 'ยกเลิกแล้ว', color: '#c23f45', bgColor: '#fff1f2', icon: 'XCircle', sortOrder: 2, isTerminal: true, description: 'ยกเลิกใบกำกับภาษีเรียบร้อยแล้ว' },

  // MovementType
  { id: 'st-mv-1', domain: 'MOVEMENT', code: 'RECEIVE', label: 'รับเข้า', color: '#16825d', bgColor: '#e8f5ed', icon: 'ArrowDownLeft', sortOrder: 1, isTerminal: false, description: 'รับสินค้าเข้าคลัง' },
  { id: 'st-mv-2', domain: 'MOVEMENT', code: 'ADJUSTMENT', label: 'ปรับยอดสต็อก', color: '#a36600', bgColor: '#fff5df', icon: 'Sliders', sortOrder: 2, isTerminal: false, description: 'ปรับเพิ่มหรือลดยอดสต็อกด้วยตนเอง' },
  { id: 'st-mv-3', domain: 'MOVEMENT', code: 'SALE', label: 'ขายหน้าร้าน', color: '#0284c7', bgColor: '#e0f2fe', icon: 'ShoppingBag', sortOrder: 3, isTerminal: false, description: 'ตัดสต็อกจากการขายหน้าร้าน POS' },
  { id: 'st-mv-4', domain: 'MOVEMENT', code: 'VOID_SALE', label: 'ยกเลิกการขาย', color: '#c23f45', bgColor: '#fff1f2', icon: 'Ban', sortOrder: 4, isTerminal: false, description: 'คืนยอดสต็อกจากการยกเลิกบิลขาย (Void)' },
  { id: 'st-mv-5', domain: 'MOVEMENT', code: 'TRANSFER_OUT', label: 'โอนสินค้าออก', color: '#d97706', bgColor: '#fef3c7', icon: 'ArrowUpRight', sortOrder: 5, isTerminal: false, description: 'ตัดสต็อกเพื่อโอนย้ายไปยังสาขาอื่น' },
  { id: 'st-mv-6', domain: 'MOVEMENT', code: 'TRANSFER_IN', label: 'โอนสินค้าเข้า', color: '#059669', bgColor: '#d1fae5', icon: 'ArrowDownLeft', sortOrder: 6, isTerminal: false, description: 'เพิ่มสต็อกจากการรับโอนสินค้าจากสาขาอื่น' },
  { id: 'st-mv-7', domain: 'MOVEMENT', code: 'RETURN', label: 'รับคืนสินค้า', color: '#7c3aed', bgColor: '#ede9fe', icon: 'RotateCcw', sortOrder: 7, isTerminal: false, description: 'เพิ่มสต็อกจากการรับคืนสินค้าจากลูกค้า' },
];

const mockNavigationMenus: NavigationMenuItem[] = [
  { id: 'menu-1', key: 'dashboard', section: 'MAIN', sectionLabel: 'หน้าหลัก', label: 'ภาพรวม (Dashboard)', icon: 'BarChart3', sortOrder: 10, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-2', key: 'pos', section: 'SALES', sectionLabel: 'ขายหน้าร้าน', label: 'หน้าขาย (POS)', icon: 'ShoppingCart', sortOrder: 20, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-18', key: 'tables', section: 'SALES', sectionLabel: 'ขายหน้าร้าน', label: 'โต๊ะ & สั่งอาหาร QR', icon: 'QrCode', sortOrder: 25, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-19', key: 'appointments', section: 'SALES', sectionLabel: 'ขายหน้าร้าน', label: 'คิวนัดหมาย & จองบริการ', icon: 'CalendarDays', sortOrder: 26, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-3', key: 'shifts', section: 'SALES', sectionLabel: 'ขายหน้าร้าน', label: 'กะเงินสด', icon: 'CircleDollarSign', sortOrder: 30, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-4', key: 'sales_history', section: 'SALES', sectionLabel: 'ขายหน้าร้าน', label: 'ประวัติการขาย', icon: 'FileText', sortOrder: 40, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-5', key: 'customers', section: 'MARKETING', sectionLabel: 'ลูกค้าและการตลาด', label: 'ลูกค้าและสมาชิก', icon: 'UserRound', sortOrder: 50, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-6', key: 'promotions', section: 'MARKETING', sectionLabel: 'ลูกค้าและการตลาด', label: 'โปรโมชันและคูปอง', icon: 'BadgePercent', sortOrder: 60, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-7', key: 'line_oa', section: 'MARKETING', sectionLabel: 'ลูกค้าและการตลาด', label: 'LINE OA & E-Receipt', icon: 'MessageCircle', sortOrder: 70, allowedRoles: ['OWNER', 'MANAGER'], requiredFeature: 'FEATURE_LINE_OA', active: true },
  { id: 'menu-8', key: 'products', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'สินค้าของร้าน', icon: 'Package', sortOrder: 80, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-9', key: 'transfers', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'โอนย้ายสต็อก', icon: 'ArrowLeftRight', sortOrder: 90, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-10', key: 'stock_take', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'ตรวจนับสต็อก', icon: 'ClipboardCheck', sortOrder: 100, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-11', key: 'barcode', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'พิมพ์บาร์โค้ด / ป้ายราคา', icon: 'Tag', sortOrder: 110, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-12', key: 'suppliers', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'ผู้จำหน่าย', icon: 'Building', sortOrder: 120, allowedRoles: ['OWNER', 'MANAGER'], active: true },
  { id: 'menu-13', key: 'procurement', section: 'INVENTORY', sectionLabel: 'สินค้าและสต็อก', label: 'สั่งซื้อและรับสินค้า (PO)', icon: 'ClipboardList', sortOrder: 130, allowedRoles: ['OWNER', 'MANAGER'], active: true },
  { id: 'menu-14', key: 'reports', section: 'MANAGEMENT', sectionLabel: 'จัดการร้าน', label: 'รายงานยอดขาย', icon: 'FileSpreadsheet', sortOrder: 140, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'], active: true },
  { id: 'menu-15', key: 'branches_staff', section: 'MANAGEMENT', sectionLabel: 'จัดการร้าน', label: 'สาขาและพนักงาน', icon: 'Building2', sortOrder: 150, allowedRoles: ['OWNER'], active: true },
  { id: 'menu-16', key: 'master_data', section: 'MANAGEMENT', sectionLabel: 'จัดการร้าน', label: 'สถานะและ Master Data', icon: 'SlidersHorizontal', sortOrder: 160, allowedRoles: ['OWNER', 'MANAGER'], active: true },
  { id: 'menu-17', key: 'audit_log', section: 'MANAGEMENT', sectionLabel: 'จัดการร้าน', label: 'ประวัติการตรวจสอบ (Audit)', icon: 'History', sortOrder: 170, allowedRoles: ['OWNER', 'MANAGER'], active: true },
];

const mockPositions: Position[] = [
  { id: 'pos-1', code: 'OWNER', name: 'เจ้าของร้าน / ผู้บริหาร', description: 'มีสิทธิ์การเข้าถึงและการจัดการสูงสุดทุกเมนูของระบบ', isSystem: true, active: true, createdAt: new Date().toISOString() },
  { id: 'pos-2', code: 'MANAGER', name: 'ผู้จัดการร้าน / สาขา', description: 'ดูแลภาพรวมการขาย สต็อก พนักงาน และรายงานบริหาร', isSystem: true, active: true, createdAt: new Date().toISOString() },
  { id: 'pos-3', code: 'HEAD_CASHIER', name: 'หัวหน้าแคชเชียร์', description: 'ดูแลการขาย กะเงินสด ประวัติการขาย และรายงานสรุปหน้าเคาน์เตอร์', isSystem: false, active: true, createdAt: new Date().toISOString() },
  { id: 'pos-4', code: 'CASHIER', name: 'พนักงานแคชเชียร์', description: 'ทำรายการขายหน้าร้าน เปิด/ปิดกะเงินสด และสมัครสมาชิกลูกค้า', isSystem: true, active: true, createdAt: new Date().toISOString() },
  { id: 'pos-5', code: 'STOCK_CLERK', name: 'เจ้าหน้าที่คลังสินค้า', description: 'ตรวจนับสต็อก โอนย้ายสินค้า สั่งซื้อสินค้า และพิมพ์บาร์โค้ด', isSystem: false, active: true, createdAt: new Date().toISOString() },
  { id: 'pos-6', code: 'ACCOUNTANT', name: 'ฝ่ายการเงินและบัญชี', description: 'ตรวจสอบประวัติการขาย ใบกำกับภาษี สรุปกะ และรายงานทางการเงิน', isSystem: false, active: true, createdAt: new Date().toISOString() },
];

const mockPositionPermissions: Record<string, Record<string, { canView: boolean; canExport: boolean }>> = {
  'pos-1': {},
  'pos-2': {},
  'pos-3': {},
  'pos-4': {},
  'pos-5': {},
  'pos-6': {},
};

for (const m of mockNavigationMenus) {
  mockPositionPermissions['pos-1'][m.id] = { canView: true, canExport: true };
  mockPositionPermissions['pos-2'][m.id] = { canView: m.key !== 'branches_staff', canExport: true };
  mockPositionPermissions['pos-3'][m.id] = { canView: ['dashboard', 'pos', 'tables', 'appointments', 'shifts', 'sales_history', 'customers', 'promotions', 'products', 'reports'].includes(m.key), canExport: true };
  mockPositionPermissions['pos-4'][m.id] = { canView: ['pos', 'tables', 'appointments', 'shifts', 'sales_history', 'customers', 'products'].includes(m.key), canExport: false };
  mockPositionPermissions['pos-5'][m.id] = { canView: ['dashboard', 'products', 'transfers', 'stock_take', 'barcode', 'suppliers', 'procurement'].includes(m.key), canExport: false };
  mockPositionPermissions['pos-6'][m.id] = { canView: ['dashboard', 'sales_history', 'shifts', 'reports', 'procurement'].includes(m.key), canExport: true };
}

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
  lowStockAlertEnabled: true,
  lowStockThreshold: 5,
  lowStockTargetUserId: 'U_demo_manager_line_user',
  lowStockLastAlertAt: null,
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


