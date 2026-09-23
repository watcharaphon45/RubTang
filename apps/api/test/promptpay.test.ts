import { describe, expect, it, vi } from 'vitest';
import {
  crc16,
  formatTlv,
  formatPromptPayTarget,
  generatePromptPayPayload,
  PromptPayService,
} from '../src/promptpay';
import { Principal } from '../src/auth';

describe('PromptPay Engine & EMVCo Standard', () => {
  it('calculates CRC-16 CCITT correctly', () => {
    // Standard test check: known CRC16 results
    const check1 = crc16('123456789');
    expect(check1).toBe('29B1');

    const sampleTlv = '00020101021153037645802TH6304';
    const check2 = crc16(sampleTlv);
    expect(check2.length).toBe(4);
    expect(/^[0-9A-F]{4}$/.test(check2)).toBe(true);
  });

  it('formats TLV (Tag-Length-Value) correctly', () => {
    expect(formatTlv('00', '01')).toBe('000201');
    expect(formatTlv('53', '764')).toBe('5303764');
    expect(formatTlv('58', 'TH')).toBe('5802TH');
  });

  it('formats mobile phone targets to 13 digits with 0066 prefix', () => {
    const res1 = formatPromptPayTarget('0812345678');
    expect(res1.type).toBe('MOBILE');
    expect(res1.formatted).toBe('0066812345678');

    const res2 = formatPromptPayTarget('089-999-8888');
    expect(res2.type).toBe('MOBILE');
    expect(res2.formatted).toBe('0066899998888');
  });

  it('formats National ID / Tax ID targets to 13 digits', () => {
    const res = formatPromptPayTarget('1-2345-67890-12-3');
    expect(res.type).toBe('TAX_ID');
    expect(res.formatted).toBe('1234567890123');
  });

  it('formats e-Wallet ID targets to 15 digits', () => {
    const res = formatPromptPayTarget('140001234567890', 'EWALLET');
    expect(res.type).toBe('EWALLET');
    expect(res.formatted).toBe('140001234567890');
  });

  it('generates a valid static PromptPay QR payload when amount is 0', () => {
    const payload = generatePromptPayPayload({
      target: '0812345678',
      amount: 0,
    });

    expect(payload).toContain('000201'); // Format 01
    expect(payload).toContain('010211'); // 11 = Static
    expect(payload).toContain('0016A000000677010111'); // PromptPay AID
    expect(payload).toContain('01130066812345678'); // Mobile
    expect(payload).toContain('5303764'); // THB
    expect(payload).toContain('5802TH'); // Country TH
    expect(payload).not.toContain('540'); // No amount tag in static
    expect(payload).toContain('6304'); // Checksum tag

    // Verify CRC integrity: recalculate CRC on all but last 4 characters
    const body = payload.slice(0, -4);
    const expectedCrc = payload.slice(-4);
    expect(crc16(body)).toBe(expectedCrc);
  });

  it('generates a valid dynamic PromptPay QR payload with exact amount and ref1', () => {
    const payload = generatePromptPayPayload({
      target: '0891234567',
      amount: 159.5,
      ref1: 'SALE1001',
    });

    expect(payload).toContain('010212'); // 12 = Dynamic
    expect(payload).toContain('5406159.50'); // Amount 159.50 (len 06)
    expect(payload).toContain('62120708SALE1001'); // Tag 62 Subtag 07 Ref1

    const body = payload.slice(0, -4);
    const expectedCrc = payload.slice(-4);
    expect(crc16(body)).toBe(expectedCrc);
  });
});

describe('PromptPayService', () => {
  const principalOwner: Principal = {
    userId: 'u1',
    email: 'owner@test.com',
    tenantId: 't1',
    role: 'OWNER',
    branchIds: ['b1'],
  };

  const principalCashier: Principal = {
    userId: 'u2',
    email: 'cashier@test.com',
    tenantId: 't1',
    role: 'CASHIER',
    branchIds: ['b1'],
  };

  it('allows owner to update branch promptpay settings', async () => {
    const mockPrisma = {
      branch: {
        update: vi.fn().mockResolvedValue({
          id: 'b1',
          name: 'Main Branch',
          promptPayType: 'MOBILE',
          promptPayAccount: '0812345678',
          promptPayName: 'RubTang Store',
          promptPayBank: 'KBANK',
        }),
      },
    } as any;

    const service = new PromptPayService(mockPrisma);
    const res = await service.updateBranchPromptPay(principalOwner, 'b1', {
      promptPayType: 'MOBILE',
      promptPayAccount: '0812345678',
      promptPayName: 'RubTang Store',
      promptPayBank: 'KBANK',
    });

    expect(res.promptPayAccount).toBe('0812345678');
    expect(mockPrisma.branch.update).toHaveBeenCalled();
  });

  it('prevents cashier from updating promptpay settings', async () => {
    const mockPrisma = {} as any;
    const service = new PromptPayService(mockPrisma);

    await expect(
      service.updateBranchPromptPay(principalCashier, 'b1', {
        promptPayAccount: '0811111111',
      })
    ).rejects.toThrow();
  });

  it('generates dynamic QR payload for branch with configured PromptPay', async () => {
    const mockPrisma = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          promptPayType: 'MOBILE',
          promptPayAccount: '0812345678',
          promptPayName: 'RubTang Store',
          promptPayBank: 'KBANK',
        }),
      },
    } as any;

    const service = new PromptPayService(mockPrisma);
    const res = await service.generateDynamicQr(principalCashier, 'b1', 250, 'REC-001');

    expect(res.target).toBe('0812345678');
    expect(res.amount).toBe(250);
    expect(res.payload).toContain('5406250.00');
    expect(res.accountName).toBe('RubTang Store');
  });

  it('verifies slip and detects duplicate transfer reference', async () => {
    const mockPrisma = {
      sale: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null) // 1st call: not duplicate
          .mockResolvedValueOnce({ id: 'existing-sale-1' }), // 2nd call: duplicate!
      },
    } as any;

    const service = new PromptPayService(mockPrisma);

    // Call 1: Success
    const res1 = await service.verifySlip(principalCashier, {
      expectedAmount: 150,
      transferRef: 'KBANK123456',
    });
    expect(res1.verified).toBe(true);
    expect(res1.transferRef).toBe('KBANK123456');

    // Call 2: Duplicate
    const res2 = await service.verifySlip(principalCashier, {
      expectedAmount: 150,
      transferRef: 'KBANK123456',
    });
    expect(res2.verified).toBe(false);
    expect(res2.reason).toContain('เคยถูกใช้งาน');
  });
});
