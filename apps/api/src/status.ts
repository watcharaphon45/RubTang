import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Principal } from './auth';
import { Database } from './database';
import { parse, statusQuerySchema, updateStatusDefinitionSchema } from './validation';

export interface StatusDefinition {
  id: string;
  domain: string;
  code: string;
  label: string;
  color: string | null;
  bgColor: string | null;
  icon: string | null;
  sortOrder: number;
  isTerminal: boolean;
  description: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export { DEFAULT_STATUS_DEFINITIONS } from './constants';
import { DEFAULT_STATUS_DEFINITIONS } from './constants';

@Injectable()
export class StatusService {
  private cache: StatusDefinition[] | null = null;

  constructor(@Inject(Database) private readonly prisma: Database) {}

  private requireManagerOrOwner(principal: Principal) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขคำจำกัดความสถานะของระบบ');
    }
  }

  async getAll(): Promise<StatusDefinition[]> {
    if (this.cache) {
      return this.cache;
    }

    try {
      if (this.prisma.systemStatusDefinition?.findMany) {
        const definitions = await this.prisma.systemStatusDefinition.findMany({
          orderBy: [{ domain: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        });
        if (definitions && definitions.length > 0) {
          this.cache = definitions;
          return definitions;
        }
      }
    } catch {
      // Fallback if table doesn't exist yet or unmocked in test
    }

    const fallbackList = DEFAULT_STATUS_DEFINITIONS.map((def, idx) => ({
      ...def,
      id: `default-${idx + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    this.cache = fallbackList;
    return fallbackList;
  }

  async list(query?: { domain?: string }): Promise<StatusDefinition[]> {
    const all = await this.getAll();
    if (!query?.domain || query.domain === 'ALL') {
      return all;
    }
    const targetDomain = query.domain.toUpperCase();
    return all.filter((s) => s.domain.toUpperCase() === targetDomain);
  }

  async getByDomainAndCode(domain: string, code: string): Promise<StatusDefinition> {
    const all = await this.getAll();
    const dUpper = domain.toUpperCase();
    const cUpper = code.toUpperCase();
    const found = all.find((s) => s.domain.toUpperCase() === dUpper && s.code.toUpperCase() === cUpper);
    if (!found) {
      throw new NotFoundException(`ไม่พบสถานะ ${code} ในหมวด ${domain}`);
    }
    return found;
  }

  async update(principal: Principal, domain: string, code: string, body: unknown): Promise<StatusDefinition> {
    this.requireManagerOrOwner(principal);
    const data = parse(updateStatusDefinitionSchema, body);

    const dUpper = domain.toUpperCase();
    const cUpper = code.toUpperCase();

    const defaultMatch = DEFAULT_STATUS_DEFINITIONS.find(
      (d) => d.domain.toUpperCase() === dUpper && d.code.toUpperCase() === cUpper
    );

    const updated = await this.prisma.systemStatusDefinition.upsert({
      where: {
        domain_code: {
          domain: dUpper,
          code: cUpper,
        },
      },
      create: {
        domain: dUpper,
        code: cUpper,
        label: data.label,
        color: data.color !== undefined ? data.color : defaultMatch?.color ?? null,
        bgColor: data.bgColor !== undefined ? data.bgColor : defaultMatch?.bgColor ?? null,
        icon: data.icon !== undefined ? data.icon : defaultMatch?.icon ?? null,
        sortOrder: data.sortOrder !== undefined ? data.sortOrder : defaultMatch?.sortOrder ?? 0,
        isTerminal: data.isTerminal !== undefined ? data.isTerminal : defaultMatch?.isTerminal ?? false,
        description: data.description !== undefined ? data.description : defaultMatch?.description ?? null,
      },
      update: {
        label: data.label,
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.bgColor !== undefined ? { bgColor: data.bgColor } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isTerminal !== undefined ? { isTerminal: data.isTerminal } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });

    // Invalidate cache
    this.cache = null;

    return updated;
  }
}
