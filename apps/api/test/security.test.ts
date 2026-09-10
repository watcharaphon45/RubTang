import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CatalogService } from '../src/catalog';
import { Principal, requireBranch, requireOwner, SessionGuard, tokenHash } from '../src/auth';
import { Database } from '../src/database';
import { productSchema } from '../src/validation';

const owner: Principal = { tenantId: 'a0cf0c6c-461d-4fa3-96f2-9cce4c8b91bb', userId: 'owner-a', membershipId: 'member-a', role: 'OWNER', branchIds: [] };
const branchId = 'e1c215ec-c3a4-486d-a719-e89f2c531c11';

describe('tenant and branch boundaries', () => {
  it('does not list products if branch belongs to a different tenant', async () => {
    const db = { branch: { findFirst: vi.fn().mockResolvedValue(null) }, product: { findMany: vi.fn() } };
    await expect(new CatalogService(db as unknown as Database).list(owner, branchId, '')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.branch.findFirst).toHaveBeenCalledWith({ where: { id: branchId, tenantId: owner.tenantId } });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
  it('scopes products and inventory to the authenticated tenant and selected branch', async () => {
    const db = { branch: { findFirst: vi.fn().mockResolvedValue({ id: branchId }) }, product: { findMany: vi.fn().mockResolvedValue([]) } };
    await new CatalogService(db as unknown as Database).list(owner, branchId, 'water');
    const args = db.product.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe(owner.tenantId);
    expect(args.include.inventory.where).toEqual({ tenantId: owner.tenantId, branchId });
  });
  it('blocks staff without branch assignments and owner privileges', () => {
    const cashier: Principal = { ...owner, role: 'CASHIER', branchIds: [branchId] };
    expect(() => requireBranch(cashier, branchId)).not.toThrow();
    expect(() => requireBranch(cashier, 'another-branch')).toThrow(ForbiddenException);
    expect(() => requireOwner(cashier)).toThrow(ForbiddenException);
  });
  it('rejects caller-supplied tenant and inventory fields', () => {
    expect(productSchema.safeParse({ name: 'Water', sku: 'W1', price: '10.00', tenantId: 'another-tenant' }).success).toBe(false);
    expect(productSchema.safeParse({ name: 'Water', sku: 'W1', price: '10.00', quantity: '100' }).success).toBe(false);
  });
  it('rejects imprecise and negative currency inputs', () => {
    for (const price of ['-1', '1.001', '1e2', 'NaN', '10000000000', 10.1]) expect(productSchema.safeParse({ name: 'Water', sku: 'W1', price }).success).toBe(false);
    expect(productSchema.safeParse({ name: 'Water', sku: 'W1', price: '10.25' }).success).toBe(true);
  });
  it('rejects expired sessions before attaching tenant context', async () => {
    const token = 'a'.repeat(64);
    const db = { session: { findUnique: vi.fn().mockResolvedValue({ expiresAt: new Date(0) }) } };
    const req = { cookies: { rubtang_session: token } };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    await expect(new SessionGuard(db as unknown as Database).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.session.findUnique.mock.calls[0][0].where.tokenHash).toBe(tokenHash(token));
    expect(req).not.toHaveProperty('principal');
  });
  it('records product and audit in the same transaction', async () => {
    const tx = { product: { create: vi.fn().mockResolvedValue({ id: 'p1', price: { toFixed: () => '10.00' } }) }, auditLog: { create: vi.fn().mockResolvedValue({}) } };
    const db = { $transaction: vi.fn(async callback => callback(tx)) };
    await new CatalogService(db as unknown as Database).create(owner, { name: 'Water', sku: 'W1', price: '10.00' });
    expect(tx.product.create.mock.calls[0][0].data.tenantId).toBe(owner.tenantId);
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({ tenantId: owner.tenantId, actorUserId: owner.userId, entityId: 'p1' });
  });
});
