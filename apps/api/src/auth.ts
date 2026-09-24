import { CanActivate, ConflictException, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Request, Response } from 'express';
import { Database } from './database';
import { loginSchema, parse, registerSchema } from './validation';

export const sessionCookie = 'rubtang_session';
export type Principal = {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: Role;
  branchIds: string[];
  positionId?: string | null;
  positionCode?: string | null;
  positionName?: string | null;
};
export type AuthRequest = Request & { principal: Principal };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api' });

@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly db: Database) {}

  async register(body: unknown, response: Response) {
    const input = parse(registerSchema, body);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const membership = await this.db.$transaction(async tx => {
        const user = await tx.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash } });
        const tenant = await tx.tenant.create({ data: { name: input.shopName } });
        const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: input.branchName } });
        const ownerPos = await seedDefaultPositionsForTenant(tx, tenant.id);
        const member = await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'OWNER', positionId: ownerPos.id } });
        await tx.branchAssignment.create({ data: { tenantId: tenant.id, branchId: branch.id, membershipId: member.id } });
        await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: user.id, action: 'TENANT_CREATED', entityId: tenant.id, newValue: { name: tenant.name } } });
        return member;
      });
      await this.createSession(membership.id, response);
      return { ok: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
      throw error;
    }
  }

  async login(body: unknown, response: Response) {
    const input = parse(loginSchema, body);
    const user = await this.db.user.findUnique({ where: { email: input.email }, include: { memberships: { take: 1, orderBy: { id: 'asc' } } } });
    if (!user || !await argon2.verify(user.passwordHash, input.password) || !user.memberships[0]) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await this.createSession(user.memberships[0].id, response);
    return { ok: true };
  }

  private async createSession(membershipId: string, response: Response) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await this.db.session.create({ data: { tokenHash: tokenHash(token), membershipId, expiresAt } });
    response.cookie(sessionCookie, token, { ...cookieOptions(), expires: expiresAt });
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[sessionCookie];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: {
        membership: {
          include: {
            assignments: true,
            position: true,
          },
        },
      },
    });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException();
    const m = session.membership;
    request.principal = {
      membershipId: m.id,
      tenantId: m.tenantId,
      userId: m.userId,
      role: m.role,
      branchIds: m.assignments.map(a => a.branchId),
      positionId: m.positionId,
      positionCode: m.position?.code,
      positionName: m.position?.name,
    };
    return true;
  }
}

export function requireOwner(principal: Principal) {
  if (principal.role !== 'OWNER') throw new ForbiddenException('เฉพาะเจ้าของร้านเท่านั้น');
}
export function requireBranch(principal: Principal, branchId: string) {
  if (principal.role !== 'OWNER' && !principal.branchIds.includes(branchId)) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงสาขานี้');
}

export const STANDARD_POSITIONS_DEF = [
  {
    code: 'OWNER',
    name: 'เจ้าของร้าน / ผู้บริหาร',
    description: 'มีสิทธิ์การเข้าถึงและการจัดการสูงสุดทุกเมนูของระบบ',
    isSystem: true,
    allMenus: true,
    canExportAll: true,
  },
  {
    code: 'MANAGER',
    name: 'ผู้จัดการร้าน / สาขา',
    description: 'ดูแลภาพรวมการขาย สต็อก พนักงาน และรายงานบริหาร',
    isSystem: true,
    excludeKeys: ['branches_staff'],
    canExportAll: true,
  },
  {
    code: 'HEAD_CASHIER',
    name: 'หัวหน้าแคชเชียร์',
    description: 'ดูแลการขาย กะเงินสด ประวัติการขาย และรายงานสรุปหน้าเคาน์เตอร์',
    isSystem: false,
    includeKeys: ['dashboard', 'pos', 'shifts', 'sales_history', 'customers', 'promotions', 'products', 'reports'],
    canExportAll: true,
  },
  {
    code: 'CASHIER',
    name: 'พนักงานแคชเชียร์',
    description: 'ทำรายการขายหน้าร้าน เปิด/ปิดกะเงินสด และสมัครสมาชิกลูกค้า',
    isSystem: true,
    includeKeys: ['pos', 'shifts', 'sales_history', 'customers', 'products'],
    canExportAll: false,
  },
  {
    code: 'STOCK_CLERK',
    name: 'เจ้าหน้าที่คลังสินค้า',
    description: 'ตรวจนับสต็อก โอนย้ายสินค้า สั่งซื้อสินค้า และพิมพ์บาร์โค้ด',
    isSystem: false,
    includeKeys: ['dashboard', 'products', 'transfers', 'stock_take', 'barcode', 'suppliers', 'procurement'],
    canExportAll: false,
  },
  {
    code: 'ACCOUNTANT',
    name: 'ฝ่ายการเงินและบัญชี',
    description: 'ตรวจสอบประวัติการขาย ใบกำกับภาษี สรุปกะ และรายงานทางการเงิน',
    isSystem: false,
    includeKeys: ['dashboard', 'sales_history', 'shifts', 'reports', 'procurement'],
    canExportAll: true,
  },
];

export async function seedDefaultPositionsForTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const menus = await tx.navigationMenu.findMany({ select: { id: true, key: true } });
  let ownerPos: { id: string } | null = null;

  for (const def of STANDARD_POSITIONS_DEF) {
    const pos = await tx.position.create({
      data: {
        tenantId,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: def.isSystem,
        active: true,
      },
    });

    if (def.code === 'OWNER') {
      ownerPos = pos;
    }

    if (menus.length > 0) {
      const perms = menus.map(m => {
        let canView = false;
        let canExport = false;
        if (def.allMenus) {
          canView = true;
          canExport = true;
        } else if (def.excludeKeys) {
          canView = !def.excludeKeys.includes(m.key);
          canExport = canView && !!def.canExportAll;
        } else if (def.includeKeys) {
          canView = def.includeKeys.includes(m.key);
          canExport = canView && !!def.canExportAll;
        }
        return {
          positionId: pos.id,
          menuId: m.id,
          canView,
          canExport,
        };
      });

      await tx.positionMenuPermission.createMany({
        data: perms,
      });
    }
  }

  return ownerPos!;
}

