import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { Principal, requireOwner } from './auth';
import { Database } from './database';
import { branchCreateSchema, parse, staffCreateSchema } from './validation';

@Injectable()
export class BranchStaffService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async listBranches(principal: Principal) {
    const isOwner = principal.role === 'OWNER';
    return this.db.branch.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(isOwner ? {} : { id: { in: principal.branchIds } }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async createBranch(principal: Principal, body: unknown) {
    requireOwner(principal);
    const input = parse(branchCreateSchema, body);
    try {
      return await this.db.$transaction(async tx => {
        const branch = await tx.branch.create({
          data: { tenantId: principal.tenantId, name: input.name },
          select: { id: true, name: true },
        });
        await tx.branchAssignment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: branch.id,
            membershipId: principal.membershipId,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            action: 'BRANCH_CREATED',
            entityId: branch.id,
            newValue: { name: branch.name },
          },
        });
        return branch;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('มีชื่อสาขานี้อยู่ในร้านแล้ว');
      }
      throw error;
    }
  }

  async listStaff(principal: Principal) {
    requireOwner(principal);
    const members = await this.db.membership.findMany({
      where: { tenantId: principal.tenantId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        assignments: {
          include: { branch: { select: { id: true, name: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });
    return members.map(m => ({
      id: m.id,
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      branches: m.assignments.map(a => a.branch),
    }));
  }

  async createStaff(principal: Principal, body: unknown) {
    requireOwner(principal);
    const input = parse(staffCreateSchema, body);

    const validBranches = await this.db.branch.findMany({
      where: { tenantId: principal.tenantId, id: { in: input.branchIds } },
      select: { id: true },
    });
    if (validBranches.length !== input.branchIds.length) {
      throw new BadRequestException('สาขาที่เลือกบางรายการไม่ถูกต้อง');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    try {
      return await this.db.$transaction(async tx => {
        let user = await tx.user.findUnique({ where: { email: input.email } });
        if (user) {
          const existingMember = await tx.membership.findUnique({
            where: { tenantId_userId: { tenantId: principal.tenantId, userId: user.id } },
          });
          if (existingMember) throw new ConflictException('ผู้ใช้นี้เป็นสมาชิกในร้านแล้ว');
        } else {
          user = await tx.user.create({
            data: {
              email: input.email,
              displayName: input.displayName,
              passwordHash,
            },
          });
        }

        const member = await tx.membership.create({
          data: {
            tenantId: principal.tenantId,
            userId: user.id,
            role: input.role,
          },
        });

        await tx.branchAssignment.createMany({
          data: input.branchIds.map(branchId => ({
            tenantId: principal.tenantId,
            membershipId: member.id,
            branchId,
          })),
        });

        await tx.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            action: 'STAFF_CREATED',
            entityId: member.id,
            newValue: {
              userId: user.id,
              displayName: user.displayName,
              email: user.email,
              role: input.role,
              branchIds: input.branchIds,
            },
          },
        });

        return {
          id: member.id,
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          role: member.role,
          branches: validBranches,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('มีข้อมูลซ้ำซ้อนในระบบ');
      }
      throw error;
    }
  }
}
