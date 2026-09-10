import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

if (!process.env.RUBTANG_TEST_API) throw new Error('Run npm run test:integration to use an isolated database');
const base = process.env.RUBTANG_TEST_API;
const db = new PrismaClient();
let a, b, product, branch2;
const password = 'Integration-password-123';

async function request(path, { cookie, body, origin = 'http://localhost:5173' } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(15000),
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function shop(label) {
  const email = `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.test`;
  const response = await request('/auth/register', { body: { email, password, displayName: label, shopName: label, branchName: 'Main' } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const profile = await request('/auth/me', { cookie: response.cookie });
  assert.equal(profile.status, 200);
  return { ...profile.body, cookie: response.cookie, email };
}
const stock = (overrides = {}) => ({ requestId: randomUUID(), branchId: a.branches[0].id, productId: product.id, type: 'RECEIVE', quantity: '1', note: 'Delivery test', ...overrides });
const move = body => request('/inventory/movements', { cookie: a.cookie, body });
async function balance() {
  return (await db.inventoryBalance.findUnique({ where: { tenantId_branchId_productId: { tenantId: a.tenant.id, branchId: a.branches[0].id, productId: product.id } } }))?.quantity.toString() ?? '0';
}

before(async () => {
  a = await shop('Shop A'); b = await shop('Shop B');
  const result = await request('/products', { cookie: a.cookie, body: { name: 'น้ำดื่ม', sku: 'WATER', price: '10.25' } });
  assert.equal(result.status, 201); product = result.body;
  branch2 = await db.branch.create({ data: { tenantId: a.tenant.id, name: 'Second branch' } });
});
after(async () => { await db.$disconnect(); });

test('receiving stores exact decimal balance, ledger and audit together', async () => {
  const input = stock({ quantity: '1.125' });
  const result = await move(input);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(await balance(), '1.125');
  assert.equal(result.body.balanceBefore, '0'); assert.equal(result.body.balanceAfter, '1.125');
  assert.equal(await db.auditLog.count({ where: { tenantId: a.tenant.id, entityId: result.body.id, action: 'STOCK_RECEIVE' } }), 1);
});

test('simultaneous duplicate request credits stock exactly once', async () => {
  const input = stock({ quantity: '2.125' });
  const results = await Promise.all([move(input), move(input), move(input)]);
  results.forEach(result => assert.equal(result.status, 201, JSON.stringify(result.body)));
  assert.equal(new Set(results.map(result => result.body.id)).size, 1);
  assert.equal(await balance(), '3.25');
  assert.equal(await db.stockMovement.count({ where: { tenantId: a.tenant.id, requestId: input.requestId } }), 1);
  const mismatch = await move({ ...input, quantity: '3' });
  assert.equal(mismatch.status, 409); assert.equal(await balance(), '3.25');
});

test('concurrent independent receipts do not lose updates', async () => {
  const results = await Promise.all([move(stock()), move(stock()), move(stock())]);
  results.forEach(result => assert.equal(result.status, 201, JSON.stringify(result.body)));
  assert.equal(await balance(), '6.25');
});

test('negative stock is rejected without creating a ledger or audit record', async () => {
  const count = await db.stockMovement.count();
  const audits = await db.auditLog.count();
  assert.equal((await move(stock({ type: 'ADJUSTMENT', quantity: '-100' }))).status, 409);
  assert.equal(await balance(), '6.25'); assert.equal(await db.stockMovement.count(), count); assert.equal(await db.auditLog.count(), audits);
  assert.equal((await move(stock({ type: 'ADJUSTMENT', quantity: '-0.25', note: 'Damaged' }))).status, 201);
  assert.equal(await balance(), '6');
});

test('same product maintains independent branch balances', async () => {
  assert.equal((await move(stock({ branchId: branch2.id, quantity: '20' }))).status, 201);
  const result = await request(`/products?branchId=${branch2.id}`, { cookie: a.cookie });
  assert.equal(result.body[0].quantity, '20'); assert.equal(await balance(), '6');
});

test('an audit write failure rolls back stock and movement writes', async () => {
  const count = await db.stockMovement.count();
  const initialBalance = await balance();
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'STOCK_RECEIVE' THEN RAISE EXCEPTION 'integration rollback probe'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_test_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_test_audit()`);
  try {
    assert.equal((await move(stock())).status, 500);
    assert.equal(await balance(), initialBalance);
    assert.equal(await db.stockMovement.count(), count);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER fail_test_audit ON "AuditLog"`);
    await db.$executeRawUnsafe(`DROP FUNCTION fail_test_audit()`);
  }
});

test('cross-tenant product/branch writes and reads are rejected', async () => {
  assert.equal((await request('/inventory/movements', { cookie: b.cookie, body: stock({ branchId: b.branches[0].id }) })).status, 404);
  assert.equal((await move(stock({ branchId: b.branches[0].id }))).status, 404);
  assert.equal((await request(`/inventory/movements?branchId=${a.branches[0].id}`, { cookie: b.cookie })).status, 404);
  assert.equal((await request(`/products?branchId=${a.branches[0].id}`, { cookie: b.cookie })).status, 404);
  const foreign = await request(`/products/${product.id}`, { cookie: b.cookie, body: { name: 'Hijack', sku: 'X', price: '0', active: true } });
  assert.equal(foreign.status, 404);
});

test('database composite foreign key rejects a cross-tenant inventory row', async () => {
  await assert.rejects(db.inventoryBalance.create({ data: { tenantId: b.tenant.id, branchId: b.branches[0].id, productId: product.id, quantity: 1 } }), error => error.code === 'P2003');
});

test('history is tenant/branch scoped and reports actor and balances', async () => {
  const result = await request(`/inventory/movements?branchId=${a.branches[0].id}`, { cookie: a.cookie });
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 6);
  result.body.items.forEach(item => { assert.equal(item.tenantId, a.tenant.id); assert.equal(item.branchId, a.branches[0].id); assert.equal(item.actor.user.displayName, 'Shop A'); });
  const marker = result.body.items[1];
  const cursor = encodeURIComponent(JSON.stringify({ at: marker.createdAt, id: marker.id }));
  const older = await request(`/inventory/movements?branchId=${a.branches[0].id}&cursor=${cursor}`, { cookie: a.cookie });
  assert.deepEqual(older.body.items.map(item => item.id), result.body.items.slice(2).map(item => item.id));
  const empty = await request(`/inventory/movements?branchId=${b.branches[0].id}`, { cookie: b.cookie });
  assert.deepEqual(empty.body.items, []);
});

test('editing and archiving retain stock and capture previous product values', async () => {
  const result = await request(`/products/${product.id}`, { cookie: a.cookie, body: { name: 'น้ำดื่มใหม่', sku: 'WATER', price: '12.50', active: false } });
  assert.equal(result.status, 200); assert.equal(result.body.price, '12.50');
  assert.equal((await move(stock())).status, 409); assert.equal(await balance(), '6');
  const audit = await db.auditLog.findFirst({ where: { action: 'PRODUCT_UPDATED', entityId: product.id } });
  assert.equal(audit.oldValue.price, '10.25'); assert.equal(audit.newValue.active, false);
  assert.equal((await request(`/products/${product.id}`, { cookie: a.cookie, body: { name: 'น้ำดื่มใหม่', sku: 'WATER', price: '12.50', active: true } })).status, 200);
});

test('cashier cannot write stock and manager is limited to assigned branches', async () => {
  await db.membership.updateMany({ where: { tenantId: a.tenant.id, userId: a.user.id }, data: { role: 'CASHIER' } });
  assert.equal((await move(stock())).status, 403);
  await db.membership.updateMany({ where: { tenantId: a.tenant.id, userId: a.user.id }, data: { role: 'MANAGER' } });
  assert.equal((await move(stock({ branchId: branch2.id }))).status, 403);
  assert.equal((await request(`/inventory/movements?branchId=${branch2.id}`, { cookie: a.cookie })).status, 403);
  assert.equal((await move(stock())).status, 201);
});

test('foreign Origin is blocked before any stock write', async () => {
  const count = await db.stockMovement.count();
  const result = await request('/inventory/movements', { cookie: a.cookie, body: stock(), origin: 'https://untrusted.example' });
  assert.equal(result.status, 403); assert.equal(await db.stockMovement.count(), count);
});

test('login issues a valid session and logout revokes it', async () => {
  const login = await request('/auth/login', { body: { email: b.email, password } });
  assert.equal(login.status, 200);
  assert.equal((await request('/auth/me', { cookie: login.cookie })).status, 200);
  assert.equal((await request('/auth/logout', { cookie: login.cookie, body: {} })).status, 200);
  assert.equal((await request('/auth/me', { cookie: login.cookie })).status, 401);
  const token = login.cookie.split('=')[1];
  assert.equal(await db.session.count({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } }), 0);
});
