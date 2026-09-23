import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal, requireBranch } from './auth';
import { Database } from './database';
import { createPromotionSchema, parse, updatePromotionSchema, validatePromotionSchema } from './validation';

@Injectable()
export class PromotionService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async listPromotions(principal: Principal, branchIdQuery?: unknown, activeOnlyQuery?: unknown) {
    let branchId: string | undefined;
    if (branchIdQuery && typeof branchIdQuery === 'string' && branchIdQuery.trim().length > 0) {
      branchId = parse(z.string().uuid(), branchIdQuery);
      requireBranch(principal, branchId);
    }

    const activeOnly = activeOnlyQuery === 'true' || activeOnlyQuery === true;

    const where: Prisma.PromotionWhereInput = {
      tenantId: principal.tenantId,
      ...(activeOnly ? { active: true } : {}),
      ...(branchId
        ? {
            OR: [{ branchId: null }, { branchId }],
          }
        : {}),
    };

    const promotions = await this.db.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    return promotions.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      discountType: p.discountType,
      discountValue: Number(p.discountValue),
      minSpend: Number(p.minSpend),
      maxDiscount: p.maxDiscount ? Number(p.maxDiscount) : null,
      branchId: p.branchId,
      branchName: p.branch?.name ?? 'ทุกสาขา',
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
      createdAt: p.createdAt,
    }));
  }

  async createPromotion(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์สร้างโปรโมชัน');
    }

    const input = parse(createPromotionSchema, body);

    if (input.branchId) {
      requireBranch(principal, input.branchId);
    }

    if (input.code) {
      const existing = await this.db.promotion.findFirst({
        where: {
          tenantId: principal.tenantId,
          code: input.code,
        },
      });
      if (existing) {
        throw new ConflictException(`รหัสคูปอง "${input.code}" ถูกใช้งานแล้วในระบบ`);
      }
    }

    const promotion = await this.db.promotion.create({
      data: {
        tenantId: principal.tenantId,
        name: input.name,
        code: input.code || null,
        discountType: input.discountType,
        discountValue: new Prisma.Decimal(input.discountValue),
        minSpend: new Prisma.Decimal(input.minSpend),
        maxDiscount: input.maxDiscount ? new Prisma.Decimal(input.maxDiscount) : null,
        branchId: input.branchId || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'PROMOTION_CREATED',
        entityId: promotion.id,
        newValue: {
          name: promotion.name,
          code: promotion.code,
          discountType: promotion.discountType,
          discountValue: input.discountValue,
        },
      },
    });

    return {
      id: promotion.id,
      name: promotion.name,
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: Number(promotion.discountValue),
      minSpend: Number(promotion.minSpend),
      maxDiscount: promotion.maxDiscount ? Number(promotion.maxDiscount) : null,
      branchId: promotion.branchId,
      branchName: promotion.branch?.name ?? 'ทุกสาขา',
      active: promotion.active,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      createdAt: promotion.createdAt,
    };
  }

  async updatePromotion(principal: Principal, id: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('แคชเชียร์ไม่มีสิทธิ์แก้ไขโปรโมชัน');
    }

    const parsedId = parse(z.string().uuid('รหัสโปรโมชันไม่ถูกต้อง'), id);
    const input = parse(updatePromotionSchema, body);

    const existing = await this.db.promotion.findFirst({
      where: { id: parsedId, tenantId: principal.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('ไม่พบโปรโมชันที่ระบุ');
    }

    if (input.branchId) {
      requireBranch(principal, input.branchId);
    }

    if (input.code && input.code !== existing.code) {
      const duplicate = await this.db.promotion.findFirst({
        where: {
          tenantId: principal.tenantId,
          code: input.code,
          id: { not: parsedId },
        },
      });
      if (duplicate) {
        throw new ConflictException(`รหัสคูปอง "${input.code}" ถูกใช้งานแล้วในระบบ`);
      }
    }

    const updated = await this.db.promotion.update({
      where: { id: parsedId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code || null } : {}),
        ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
        ...(input.discountValue !== undefined ? { discountValue: new Prisma.Decimal(input.discountValue) } : {}),
        ...(input.minSpend !== undefined ? { minSpend: new Prisma.Decimal(input.minSpend) } : {}),
        ...(input.maxDiscount !== undefined
          ? { maxDiscount: input.maxDiscount ? new Prisma.Decimal(input.maxDiscount) : null }
          : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    });

    await this.db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'PROMOTION_UPDATED',
        entityId: updated.id,
        newValue: {
          name: updated.name,
          active: updated.active,
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      discountType: updated.discountType,
      discountValue: Number(updated.discountValue),
      minSpend: Number(updated.minSpend),
      maxDiscount: updated.maxDiscount ? Number(updated.maxDiscount) : null,
      branchId: updated.branchId,
      branchName: updated.branch?.name ?? 'ทุกสาขา',
      active: updated.active,
      startDate: updated.startDate,
      endDate: updated.endDate,
      createdAt: updated.createdAt,
    };
  }

  async validatePromotion(principal: Principal, body: unknown) {
    const input = parse(validatePromotionSchema, body);
    requireBranch(principal, input.branchId);

    const promotion = await this.db.promotion.findFirst({
      where: {
        tenantId: principal.tenantId,
        ...(input.code ? { code: input.code } : { id: input.promotionId }),
      },
    });

    if (!promotion) {
      throw new NotFoundException('ไม่พบรหัสคูปองหรือโปรโมชันนี้');
    }

    if (!promotion.active) {
      throw new ConflictException('โปรโมชันนี้ปิดการใช้งานอยู่');
    }

    const now = new Date();
    if (promotion.startDate && now < promotion.startDate) {
      throw new ConflictException('โปรโมชันนี้ยังไม่เริ่มใช้งาน');
    }
    if (promotion.endDate && now > promotion.endDate) {
      throw new ConflictException('โปรโมชันนี้หมดอายุการใช้งานแล้ว');
    }

    if (promotion.branchId && promotion.branchId !== input.branchId) {
      throw new ConflictException('โปรโมชันนี้ใช้ได้เฉพาะสาขาที่กำหนด');
    }

    const subtotal = Number(input.subtotal);
    const minSpend = Number(promotion.minSpend);

    if (subtotal < minSpend) {
      throw new ConflictException(
        `ยอดซื้อขั้นต่ำสำหรับโปรโมชันนี้คือ ${minSpend.toLocaleString('th-TH')} บาท (ปัจจุบัน ${subtotal.toLocaleString('th-TH')} บาท)`,
      );
    }

    let discountAmount = 0;
    if (promotion.discountType === 'FIXED_AMOUNT') {
      discountAmount = Math.min(Number(promotion.discountValue), subtotal);
    } else {
      const rawDiscount = (subtotal * Number(promotion.discountValue)) / 100;
      const maxDiscount = promotion.maxDiscount ? Number(promotion.maxDiscount) : Infinity;
      discountAmount = Math.min(rawDiscount, maxDiscount, subtotal);
    }

    const discountFixed = Number(discountAmount.toFixed(2));
    const finalTotal = Number(Math.max(0, subtotal - discountFixed).toFixed(2));

    return {
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: Number(promotion.discountValue),
        minSpend: Number(promotion.minSpend),
        maxDiscount: promotion.maxDiscount ? Number(promotion.maxDiscount) : null,
      },
      subtotal,
      discountAmount: discountFixed,
      finalTotal,
    };
  }
}
