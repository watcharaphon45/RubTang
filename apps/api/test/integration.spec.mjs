import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

if (!process.env.RUBTANG_TEST_API) throw new Error('Run npm run test:integration to use an isolated database');
const base = process.env.RUBTANG_TEST_API;
const db = new PrismaClient();
let a, b, product, branch2;
const password = 'Integration-password-123';

async function request(path, { cookie, body, method, origin = 'http://localhost:5173' } = {}) {
  const m = method || (body === undefined ? 'GET' : 'POST');
  const response = await fetch(`${base}${path}`, {
    method: m, signal: AbortSignal.timeout(15000),
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

test('checkout, partial return refund and tax invoice flows work end-to-end on PostgreSQL', async () => {
  await db.membership.updateMany({ where: { tenantId: a.tenant.id, userId: a.user.id }, data: { role: 'OWNER' } });

  await move(stock({ quantity: '5' }));
  const initialStock = parseFloat(await balance());

  const checkoutRes = await request('/checkout', {
    cookie: a.cookie,
    body: {
      branchId: a.branches[0].id,
      items: [{ productId: product.id, quantity: 2 }],
      paymentMethod: 'CASH',
      receivedAmount: '30.00',
    },
  });
  assert.equal(checkoutRes.status, 200, JSON.stringify(checkoutRes.body));
  const sale = checkoutRes.body;
  assert.ok(sale.id);
  assert.ok(sale.receiptNumber);

  const returnablesRes = await request(`/sales/${sale.id}/returnable-items`, { cookie: a.cookie });
  assert.equal(returnablesRes.status, 200, JSON.stringify(returnablesRes.body));
  assert.equal(returnablesRes.body.items.length, 1);
  const returnItem = returnablesRes.body.items[0];
  assert.equal(returnItem.remainingQuantity, 2);

  const returnRes = await request(`/sales/${sale.id}/returns`, {
    cookie: a.cookie,
    body: {
      refundMethod: 'CASH',
      reason: 'ลูกค้าขอคืน 1 ชิ้น',
      items: [
        {
          saleItemId: returnItem.saleItemId,
          quantity: '1',
          restock: true,
          condition: 'RESTOCKABLE',
        },
      ],
    },
  });
  assert.equal(returnRes.status, 201, JSON.stringify(returnRes.body));
  assert.ok(returnRes.body.returnNumber.startsWith('CN-'));
  assert.equal(returnRes.body.items.length, 1);

  const stockAfterReturn = parseFloat(await balance());
  assert.equal(stockAfterReturn, initialStock - 2 + 1);

  const taxRes = await request(`/sales/${sale.id}/tax-invoice`, {
    cookie: a.cookie,
    body: {
      customerName: 'บริษัท ทดสอบ จำกัด',
      customerTaxId: '0105559012345',
      customerAddress: 'กรุงเทพฯ',
      customerIsHeadOffice: true,
      customerBranchNumber: '00000',
    },
  });
  assert.equal(taxRes.status, 200, JSON.stringify(taxRes.body));
  assert.ok(taxRes.body.invoiceNumber.startsWith('TAX-'));
  assert.equal(taxRes.body.customer.name, 'บริษัท ทดสอบ จำกัด');
});

test('audit action definitions seeded in database and can be fetched/updated via API', async () => {
  const count = await db.auditActionDefinition.count();
  assert.ok(count >= 27, `Expected at least 27 seeded audit action definitions, got ${count}`);

  const getRes = await request('/audits/definitions', { cookie: a.cookie });
  assert.equal(getRes.status, 200, JSON.stringify(getRes.body));
  assert.ok(Array.isArray(getRes.body));
  assert.ok(getRes.body.length >= 27);
  const saleVoidDef = getRes.body.find(d => d.action === 'SALE_VOIDED');
  assert.ok(saleVoidDef);
  assert.equal(saleVoidDef.severity, 'CRITICAL');

  const putRes = await request('/audits/definitions/SALE_VOIDED', {
    cookie: a.cookie,
    method: 'PUT',
    body: {
      label: 'ยกเลิกรายการบิลขายพิเศษ',
      category: 'SALES',
      severity: 'CRITICAL',
      description: 'ปรับเปลี่ยนผ่าน API Integration Test',
    },
  });
  assert.equal(putRes.status, 200, JSON.stringify(putRes.body));
  assert.equal(putRes.body.label, 'ยกเลิกรายการบิลขายพิเศษ');

  const inDb = await db.auditActionDefinition.findUnique({ where: { action: 'SALE_VOIDED' } });
  assert.equal(inDb.label, 'ยกเลิกรายการบิลขายพิเศษ');
  assert.equal(inDb.description, 'ปรับเปลี่ยนผ่าน API Integration Test');
});

test('system status definitions seeded in database and can be fetched/updated via API', async () => {
  const count = await db.systemStatusDefinition.count();
  assert.ok(count >= 20, `Expected at least 20 seeded system status definitions, got ${count}`);

  const allRes = await request('/system/statuses', { cookie: a.cookie });
  assert.equal(allRes.status, 200, JSON.stringify(allRes.body));
  assert.ok(Array.isArray(allRes.body));
  assert.ok(allRes.body.length >= 20);

  const transferRes = await request('/system/statuses?domain=TRANSFER', { cookie: a.cookie });
  assert.equal(transferRes.status, 200, JSON.stringify(transferRes.body));
  assert.ok(Array.isArray(transferRes.body));
  assert.equal(transferRes.body.length, 3);
  assert.ok(transferRes.body.every(s => s.domain === 'TRANSFER'));

  const singleRes = await request('/system/statuses/TRANSFER/IN_TRANSIT', { cookie: a.cookie });
  assert.equal(singleRes.status, 200, JSON.stringify(singleRes.body));
  assert.equal(singleRes.body.code, 'IN_TRANSIT');
  assert.equal(singleRes.body.label, 'กำลังขนส่ง');

  const updateRes = await request('/system/statuses/TRANSFER/IN_TRANSIT', {
    cookie: a.cookie,
    method: 'PUT',
    body: {
      label: 'อยู่ระหว่างนำส่งสาขาปลายทาง',
      color: '#b45309',
      bgColor: '#fef3c7',
      description: 'ปรับปรุงชื่อสถานะผ่าน Integration Test',
    },
  });
  assert.equal(updateRes.status, 200, JSON.stringify(updateRes.body));
  assert.equal(updateRes.body.label, 'อยู่ระหว่างนำส่งสาขาปลายทาง');

  const inDb = await db.systemStatusDefinition.findUnique({
    where: { domain_code: { domain: 'TRANSFER', code: 'IN_TRANSIT' } },
  });
  assert.equal(inDb.label, 'อยู่ระหว่างนำส่งสาขาปลายทาง');
  assert.equal(inDb.color, '#b45309');
});

test('navigation menus seeded in database, filtered by role and updatable via API', async () => {
  const count = await db.navigationMenu.count();
  assert.ok(count >= 17, `Expected at least 17 seeded navigation menus, got ${count}`);

  // Owner sees all active menus allowed for OWNER
  const ownerRes = await request('/menus', { cookie: a.cookie });
  assert.equal(ownerRes.status, 200, JSON.stringify(ownerRes.body));
  assert.ok(Array.isArray(ownerRes.body));
  assert.ok(ownerRes.body.length >= 17);

  // Manageable menus endpoint (for management modal)
  const manageRes = await request('/menus/manage', { cookie: a.cookie });
  assert.equal(manageRes.status, 200, JSON.stringify(manageRes.body));
  assert.ok(Array.isArray(manageRes.body));
  assert.ok(manageRes.body.length >= 17);

  // Find POS menu
  const posMenu = manageRes.body.find(m => m.key === 'pos');
  assert.ok(posMenu, 'Expected pos menu to exist');
  assert.equal(posMenu.label, 'หน้าขาย (POS)');

  // Owner updates label
  const updateRes = await request(`/menus/${posMenu.id}`, {
    cookie: a.cookie,
    method: 'POST',
    body: {
      label: 'ระบบแคชเชียร์ขายหน้าร้าน (POS Pro)',
      sortOrder: 1,
      allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
    },
  });
  assert.equal(updateRes.status, 200, JSON.stringify(updateRes.body));
  assert.equal(updateRes.body.label, 'ระบบแคชเชียร์ขายหน้าร้าน (POS Pro)');

  // Verify in DB
  const inDb = await db.navigationMenu.findUnique({ where: { id: posMenu.id } });
  assert.equal(inDb.label, 'ระบบแคชเชียร์ขายหน้าร้าน (POS Pro)');
});

test('positions and RBAC permission matrix seeded in database, queryable and updatable via API', async () => {
  const count = await db.position.count();
  assert.ok(count >= 6, `Expected at least 6 seeded positions, got ${count}`);

  // Fetch positions via API
  const positionsRes = await request('/positions', { cookie: a.cookie });
  assert.equal(positionsRes.status, 200, JSON.stringify(positionsRes.body));
  assert.ok(Array.isArray(positionsRes.body));
  assert.ok(positionsRes.body.length >= 6);

  // Check owner position has member count
  const ownerPos = positionsRes.body.find(p => p.code === 'OWNER');
  assert.ok(ownerPos, 'Expected OWNER position to exist');
  assert.equal(ownerPos.isSystem, true);

  // Create a custom position
  const createRes = await request('/positions', {
    cookie: a.cookie,
    method: 'POST',
    body: {
      code: 'BARISTA_INT',
      name: 'บาริสต้าประจำร้าน',
      description: 'ตำแหน่งทดสอบผ่าน Integration Test',
    },
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  assert.equal(createRes.body.code, 'BARISTA_INT');

  // Fetch Permission Matrix
  const matrixRes = await request('/positions/matrix', { cookie: a.cookie });
  assert.equal(matrixRes.status, 200, JSON.stringify(matrixRes.body));
  assert.ok(matrixRes.body.positions.length >= 7);
  assert.ok(matrixRes.body.menus.length >= 17);
  assert.ok(matrixRes.body.matrix[ownerPos.id]);

  // Update permissions for custom position
  const menuList = matrixRes.body.menus;
  const posMenu = menuList.find(m => m.key === 'pos');
  assert.ok(posMenu);

  const updatePermsRes = await request(`/positions/${createRes.body.id}/permissions`, {
    cookie: a.cookie,
    method: 'PUT',
    body: {
      permissions: [
        { menuId: posMenu.id, canView: true, canExport: false },
      ],
    },
  });
  assert.equal(updatePermsRes.status, 200, JSON.stringify(updatePermsRes.body));
  assert.equal(updatePermsRes.body.ok, true);

  // Verify in DB
  const permInDb = await db.positionMenuPermission.findUnique({
    where: {
      positionId_menuId: {
        positionId: createRes.body.id,
        menuId: posMenu.id,
      },
    },
  });
  assert.ok(permInDb);
  assert.equal(permInDb.canView, true);
});




