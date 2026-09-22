import { ApiError, Product, Profile } from './api';

type Movement = {
  id: string; type: 'RECEIVE' | 'ADJUSTMENT'; quantity: string; balanceBefore: string; balanceAfter: string;
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
const movements: Movement[] = [];

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
  throw new ApiError(404, `Mock endpoint not found: ${pathname}`);
}
