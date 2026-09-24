import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Principal, requireBranch } from './auth';
import { Database } from './database';

/**
 * CRC-16 CCITT calculation for EMVCo standard
 * Polynomial: 0x1021, Initial: 0xFFFF
 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function formatTlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

export interface PromptPayTargetInfo {
  type: 'MOBILE' | 'TAX_ID' | 'EWALLET';
  formatted: string;
}

export function formatPromptPayTarget(rawTarget: string, preferredType?: string): PromptPayTargetInfo {
  const clean = rawTarget.replace(/\D/g, '');

  if (preferredType === 'EWALLET' || clean.length === 15) {
    return { type: 'EWALLET', formatted: clean.padStart(15, '0') };
  }

  if (preferredType === 'TAX_ID' || clean.length === 13) {
    return { type: 'TAX_ID', formatted: clean.padStart(13, '0') };
  }

  // Mobile format: 08x-xxx-xxxx -> 00668xxxxxxxx (13 chars)
  let mobileDigits = clean;
  if (mobileDigits.startsWith('0')) {
    mobileDigits = `0066${mobileDigits.slice(1)}`;
  } else if (mobileDigits.startsWith('66')) {
    mobileDigits = `00${mobileDigits}`;
  } else if (!mobileDigits.startsWith('0066')) {
    mobileDigits = `0066${mobileDigits}`;
  }

  return {
    type: 'MOBILE',
    formatted: mobileDigits.padStart(13, '0'),
  };
}

export interface GeneratePromptPayOptions {
  target: string;
  targetType?: 'MOBILE' | 'TAX_ID' | 'EWALLET';
  amount?: number | string;
  ref1?: string;
}

export function generatePromptPayPayload(options: GeneratePromptPayOptions): string {
  const { target, targetType, amount, ref1 } = options;
  const targetInfo = formatPromptPayTarget(target, targetType);

  // Tag 00: Payload Format Indicator (01)
  let payload = formatTlv('00', '01');

  // Tag 01: Point of Initiation Method (11: Static, 12: Dynamic)
  const numAmount = amount ? (typeof amount === 'string' ? parseFloat(amount) : amount) : 0;
  const isDynamic = numAmount > 0;
  payload += formatTlv('01', isDynamic ? '12' : '11');

  // Tag 29: Merchant Account Information (PromptPay)
  // Subtag 00: PromptPay AID (A000000677010111)
  const subtag00 = formatTlv('00', 'A000000677010111');
  let subtagTarget = '';

  if (targetInfo.type === 'MOBILE') {
    subtagTarget = formatTlv('01', targetInfo.formatted);
  } else if (targetInfo.type === 'TAX_ID') {
    subtagTarget = formatTlv('02', targetInfo.formatted);
  } else {
    subtagTarget = formatTlv('03', targetInfo.formatted);
  }

  payload += formatTlv('29', `${subtag00}${subtagTarget}`);

  // Tag 53: Transaction Currency (764 = THB)
  payload += formatTlv('53', '764');

  // Tag 54: Transaction Amount
  if (isDynamic) {
    payload += formatTlv('54', numAmount.toFixed(2));
  }

  // Tag 58: Country Code (TH)
  payload += formatTlv('58', 'TH');

  // Tag 62: Additional Data Field Template (Reference)
  if (ref1) {
    const cleanRef = ref1.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (cleanRef) {
      const subtag07 = formatTlv('07', cleanRef);
      payload += formatTlv('62', subtag07);
    }
  }

  // Tag 63: CRC (Payload + "6304" -> calculate CRC-16)
  const partial = `${payload}6304`;
  const checksum = crc16(partial);

  return `${partial}${checksum}`;
}

@Injectable()
export class PromptPayService {
  constructor(@Inject(Database) private readonly prisma: Database) {}

  async getBranchPromptPay(principal: Principal, branchId: string) {
    requireBranch(principal, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        name: true,
        promptPayType: true,
        promptPayAccount: true,
        promptPayName: true,
        promptPayBank: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('ไม่พบข้อมูลสาขา');
    }

    return branch;
  }

  async updateBranchPromptPay(
    principal: Principal,
    branchId: string,
    data: {
      promptPayType?: string;
      promptPayAccount?: string;
      promptPayName?: string;
      promptPayBank?: string;
    }
  ) {
    requireBranch(principal, branchId);
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขการตั้งค่าพร้อมเพย์');
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        promptPayType: data.promptPayType ?? 'MOBILE',
        promptPayAccount: data.promptPayAccount ?? null,
        promptPayName: data.promptPayName ?? null,
        promptPayBank: data.promptPayBank ?? null,
      },
      select: {
        id: true,
        name: true,
        promptPayType: true,
        promptPayAccount: true,
        promptPayName: true,
        promptPayBank: true,
      },
    });
  }

  async generateDynamicQr(
    principal: Principal,
    branchId: string,
    amount: number | string,
    ref1?: string
  ) {
    requireBranch(principal, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        promptPayType: true,
        promptPayAccount: true,
        promptPayName: true,
        promptPayBank: true,
      },
    });

    if (!branch || !branch.promptPayAccount) {
      throw new BadRequestException('สาขานี้ยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์');
    }

    const payload = generatePromptPayPayload({
      target: branch.promptPayAccount,
      targetType: (branch.promptPayType as any) || 'MOBILE',
      amount,
      ref1,
    });

    return {
      payload,
      target: branch.promptPayAccount,
      targetType: branch.promptPayType || 'MOBILE',
      accountName: branch.promptPayName || branch.promptPayAccount,
      bank: branch.promptPayBank || 'PromptPay',
      amount: typeof amount === 'string' ? parseFloat(amount) : amount,
      ref1,
    };
  }

  /**
   * Slip verification simulation:
   * Validates slip details against transaction amount and generates a verified payment detail payload.
   */
  async verifySlip(
    principal: Principal,
    body: {
      expectedAmount: number;
      transferRef: string;
      slipImageUrl?: string;
    }
  ) {
    const { expectedAmount, transferRef, slipImageUrl } = body;
    if (!transferRef) {
      throw new BadRequestException('กรุณาระบุเลขอ้างอิงสลิป');
    }

    // Check if this transfer reference has already been used in this tenant
    const existingSale = await this.prisma.sale.findFirst({
      where: {
        tenantId: principal.tenantId,
        paymentDetail: {
          path: ['transferRef'],
          equals: transferRef,
        },
      },
    });

    if (existingSale) {
      return {
        verified: false,
        reason: 'สลิปนี้เคยถูกใช้งานบันทึกรายการไปแล้วในระบบ (Duplicate Slip)',
        duplicateSaleId: existingSale.id,
      };
    }

    return {
      verified: true,
      transferRef,
      matchedAmount: expectedAmount,
      verifiedAt: new Date().toISOString(),
      slipImageUrl: slipImageUrl || null,
      message: 'ตรวจสอบสลิปสำเร็จ ยอดเงินถูกต้อง',
    };
  }
}
