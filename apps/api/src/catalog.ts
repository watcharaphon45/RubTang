import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal, requireBranch, requireOwner } from './auth';
import { Database } from './database';
import { parse, productSchema, productUpdateSchema } from './validation';

@Injectable()
export class CatalogService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async update(principal: Principal, productId: unknown, body: unknown) {
    requireOwner(principal);
    const id = parse(z.uuid(), productId);
    const input = parse(productUpdateSchema, body);
    try {
      return await this.db.$transaction(async tx => {
        const old = await tx.product.findUnique({ where: { tenantId_id: { tenantId: principal.tenantId, id } } });
        if (!old) throw new NotFoundException('ไม่พบสินค้า');
        const product = await tx.product.update({ where: { tenantId_id: { tenantId: principal.tenantId, id } }, data: { ...input, barcode: input.barcode || null } });
        await tx.auditLog.create({ data: {
          tenantId: principal.tenantId, actorUserId: principal.userId, action: 'PRODUCT_UPDATED', entityId: id,
          oldValue: { name: old.name, sku: old.sku, barcode: old.barcode, price: old.price.toFixed(2), active: old.active }, newValue: { ...input },
        } });
        return { ...product, price: product.price.toFixed(2) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('SKU หรือบาร์โค้ดนี้มีอยู่ในร้านแล้ว');
        if (error.code === 'P2034') throw new ConflictException('สินค้าถูกแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่');
      }
      throw error;
    }
  }

  async list(principal: Principal, branchId: unknown, search: unknown) {
    const branch = parse(z.uuid(), branchId);
    const query = parse(z.string().trim().max(100).default(''), search);
    requireBranch(principal, branch);
    const exists = await this.db.branch.findFirst({ where: { id: branch, tenantId: principal.tenantId } });
    if (!exists) throw new NotFoundException('ไม่พบสาขา');
    const products = await this.db.product.findMany({
      where: { tenantId: principal.tenantId, ...(query ? { OR: [ { name: { contains: query, mode: 'insensitive' as const } }, { sku: { contains: query, mode: 'insensitive' as const } }, { barcode: { contains: query } } ] } : {}) },
      include: { inventory: { where: { tenantId: principal.tenantId, branchId: branch } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return products.map(({ inventory, ...product }) => ({ ...product, price: product.price.toFixed(2), quantity: inventory[0]?.quantity.toString() ?? '0' }));
  }

  async create(principal: Principal, body: unknown) {
    requireOwner(principal);
    const input = parse(productSchema, body);
    try {
      return await this.db.$transaction(async tx => {
        const product = await tx.product.create({ data: { ...input, barcode: input.barcode || null, tenantId: principal.tenantId } });
        await tx.auditLog.create({ data: { tenantId: principal.tenantId, actorUserId: principal.userId, action: 'PRODUCT_CREATED', entityId: product.id, newValue: { ...input } } });
        return { ...product, price: product.price.toFixed(2) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SKU หรือบาร์โค้ดนี้มีอยู่ในร้านแล้ว');
      throw error;
    }
  }
}
