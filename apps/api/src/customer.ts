import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Principal } from './auth';
import { Database } from './database';
import { customerCreateSchema, parse } from './validation';

@Injectable()
export class CustomerService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async list(principal: Principal, searchQuery: unknown) {
    const term = parse(z.string().trim().max(100).default(''), searchQuery);
    return this.db.customer.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        points: true,
        lifetimePoints: true,
        tier: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(principal: Principal, body: unknown) {
    const input = parse(customerCreateSchema, body);
    try {
      return await this.db.$transaction(async tx => {
        const customer = await tx.customer.create({
          data: {
            tenantId: principal.tenantId,
            name: input.name,
            phone: input.phone,
            note: input.note || null,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            action: 'CUSTOMER_CREATED',
            entityId: customer.id,
            newValue: { name: customer.name, phone: customer.phone },
          },
        });

        return customer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('เบอร์โทรศัพท์นี้ถูกลงทะเบียนไว้แล้วในร้าน');
      }
      throw error;
    }
  }

  async getById(principal: Principal, customerId: unknown) {
    const id = parse(z.string().uuid(), customerId);
    const customer = await this.db.customer.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: {
        sales: {
          select: {
            id: true,
            receiptNumber: true,
            total: true,
            createdAt: true,
            branch: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        pointLedgers: {
          select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!customer) throw new NotFoundException('ไม่พบข้อมูลลูกค้า');
    return {
      ...customer,
      sales: customer.sales.map(s => ({
        ...s,
        total: s.total.toFixed(2),
        createdAt: s.createdAt.toISOString(),
      })),
      pointLedger: customer.pointLedgers.map(l => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}
