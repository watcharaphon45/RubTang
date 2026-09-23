import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipTier, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal } from './auth';
import { Database } from './database';
import {
  createLoyaltyRewardSchema,
  manualPointAdjustmentSchema,
  parse,
  updateLoyaltyRewardSchema,
} from './validation';

export function calculateTier(lifetimePoints: number): MembershipTier {
  if (lifetimePoints >= 2000) return 'PLATINUM';
  if (lifetimePoints >= 1000) return 'GOLD';
  if (lifetimePoints >= 300) return 'SILVER';
  return 'BRONZE';
}

@Injectable()
export class LoyaltyService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async getCustomerLedger(principal: Principal, customerId: string) {
    const custId = parse(z.string().uuid(), customerId);
    const customer = await this.db.customer.findFirst({
      where: { id: custId, tenantId: principal.tenantId },
    });
    if (!customer) throw new NotFoundException('ไม่พบข้อมูลลูกค้า');

    const ledgers = await this.db.pointLedger.findMany({
      where: { tenantId: principal.tenantId, customerId: custId },
      include: {
        actor: { select: { user: { select: { displayName: true } } } },
        sale: { select: { receiptNumber: true, total: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        points: customer.points,
        lifetimePoints: customer.lifetimePoints,
        tier: customer.tier,
      },
      ledgers: ledgers.map(l => ({
        id: l.id,
        type: l.type,
        amount: l.amount,
        balanceAfter: l.balanceAfter,
        reason: l.reason,
        saleReceiptNumber: l.sale?.receiptNumber ?? null,
        actorName: l.actor?.user.displayName ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  async adjustPoints(principal: Principal, customerId: string, body: unknown) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถปรับแต้มด้วยมือได้');
    }

    const custId = parse(z.string().uuid(), customerId);
    const { amount, reason } = parse(manualPointAdjustmentSchema, body);

    return this.db.$transaction(async tx => {
      const customer = await tx.customer.findFirst({
        where: { id: custId, tenantId: principal.tenantId },
      });
      if (!customer) throw new NotFoundException('ไม่พบข้อมูลลูกค้า');

      const newPoints = customer.points + amount;
      if (newPoints < 0) {
        throw new BadRequestException(`แต้มคงเหลือไม่เพียงพอสำหรับการปรับลบ (มีอยู่ ${customer.points} แต้ม)`);
      }

      const newLifetime = amount > 0 ? customer.lifetimePoints + amount : customer.lifetimePoints;
      const newTier = calculateTier(newLifetime);

      const updatedCustomer = await tx.customer.update({
        where: { id: custId },
        data: {
          points: newPoints,
          lifetimePoints: newLifetime,
          tier: newTier,
        },
      });

      const ledger = await tx.pointLedger.create({
        data: {
          tenantId: principal.tenantId,
          customerId: custId,
          actorMembershipId: principal.membershipId,
          type: 'ADJUST',
          amount,
          balanceAfter: newPoints,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: 'CUSTOMER_POINTS_ADJUSTED',
          entityId: custId,
          oldValue: { points: customer.points, tier: customer.tier },
          newValue: { points: newPoints, amount, reason, tier: newTier },
        },
      });

      return {
        customer: {
          id: updatedCustomer.id,
          name: updatedCustomer.name,
          phone: updatedCustomer.phone,
          points: updatedCustomer.points,
          lifetimePoints: updatedCustomer.lifetimePoints,
          tier: updatedCustomer.tier,
        },
        ledger: {
          id: ledger.id,
          type: ledger.type,
          amount: ledger.amount,
          balanceAfter: ledger.balanceAfter,
          reason: ledger.reason,
          createdAt: ledger.createdAt.toISOString(),
        },
      };
    });
  }

  async listRewards(principal: Principal) {
    const rewards = await this.db.loyaltyReward.findMany({
      where: { tenantId: principal.tenantId },
      orderBy: [{ active: 'desc' }, { pointsCost: 'asc' }],
    });

    return rewards.map(r => ({
      id: r.id,
      title: r.title,
      pointsCost: r.pointsCost,
      discountAmount: r.discountAmount.toFixed(2),
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createReward(principal: Principal, body: unknown) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถเพิ่มของรางวัลได้');
    }

    const input = parse(createLoyaltyRewardSchema, body);
    const reward = await this.db.loyaltyReward.create({
      data: {
        tenantId: principal.tenantId,
        title: input.title,
        pointsCost: input.pointsCost,
        discountAmount: new Prisma.Decimal(input.discountAmount),
      },
    });

    return {
      id: reward.id,
      title: reward.title,
      pointsCost: reward.pointsCost,
      discountAmount: reward.discountAmount.toFixed(2),
      active: reward.active,
      createdAt: reward.createdAt.toISOString(),
    };
  }

  async toggleReward(principal: Principal, rewardId: string) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถแก้ไขของรางวัลได้');
    }

    const id = parse(z.string().uuid(), rewardId);
    const reward = await this.db.loyaltyReward.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!reward) throw new NotFoundException('ไม่พบรายการของรางวัล');

    const updated = await this.db.loyaltyReward.update({
      where: { id },
      data: { active: !reward.active },
    });

    return {
      id: updated.id,
      title: updated.title,
      pointsCost: updated.pointsCost,
      discountAmount: updated.discountAmount.toFixed(2),
      active: updated.active,
    };
  }

  async updateReward(principal: Principal, rewardId: string, body: unknown) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการเท่านั้นที่สามารถแก้ไขของรางวัลได้');
    }

    const id = parse(z.string().uuid(), rewardId);
    const input = parse(updateLoyaltyRewardSchema, body);

    const reward = await this.db.loyaltyReward.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!reward) throw new NotFoundException('ไม่พบรายการของรางวัล');

    const updated = await this.db.loyaltyReward.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
        ...(input.discountAmount !== undefined ? { discountAmount: new Prisma.Decimal(input.discountAmount) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      pointsCost: updated.pointsCost,
      discountAmount: updated.discountAmount.toFixed(2),
      active: updated.active,
    };
  }
}
