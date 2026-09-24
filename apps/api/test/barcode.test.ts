import { describe, expect, it } from 'vitest';
import {
  calculateEan13Checksum,
  generateBarcodeSvg,
  generateCode128Pattern,
  generateEan13Pattern,
  generateInternalBarcode,
  renderBarcodeSvg,
  validateEan13,
} from '../src/barcode';

describe('Barcode Engine & Generator', () => {
  describe('calculateEan13Checksum', () => {
    it('calculates correct check digit for known Thai barcode prefix (885)', () => {
      // 885000000001 -> check digit should be 0 (Sum = 40)
      const check = calculateEan13Checksum('885000000001');
      expect(check).toBe(0);
    });

    it('calculates correct check digit for retail internal barcode (200 prefix)', () => {
      // 200000000000 -> 2*1 = 2 -> (10 - 2) = 8
      const check = calculateEan13Checksum('200000000000');
      expect(check).toBe(8);
    });

    it('calculates correct check digit for standard test vector', () => {
      // 400638133393 -> 4006381333931 (STABILO Point 88)
      const check = calculateEan13Checksum('400638133393');
      expect(check).toBe(1);
    });

    it('returns 0 when input has fewer than 12 digits', () => {
      expect(calculateEan13Checksum('12345')).toBe(0);
    });
  });

  describe('validateEan13', () => {
    it('validates a correct 13-digit EAN-13 barcode', () => {
      expect(validateEan13('8850000000010')).toBe(true);
      expect(validateEan13('4006381333931')).toBe(true);
      expect(validateEan13('2000000000008')).toBe(true);
    });

    it('rejects barcode with wrong check digit', () => {
      expect(validateEan13('8850000000015')).toBe(false);
      expect(validateEan13('4006381333939')).toBe(false);
    });

    it('rejects barcode with incorrect length', () => {
      expect(validateEan13('885000000001')).toBe(false);
      expect(validateEan13('88500000000100')).toBe(false);
      expect(validateEan13('')).toBe(false);
    });

    it('strips non-digit characters during validation', () => {
      expect(validateEan13('885-000-000001-0')).toBe(true);
      expect(validateEan13('885 000 000001 0')).toBe(true);
    });
  });

  describe('generateInternalBarcode', () => {
    it('generates a valid 13-digit EAN-13 barcode starting with 200', () => {
      const barcode = generateInternalBarcode('DRINK-001');
      expect(barcode).toHaveLength(13);
      expect(barcode.startsWith('200')).toBe(true);
      expect(validateEan13(barcode)).toBe(true);
    });

    it('generates different barcodes for different alphanumeric SKUs', () => {
      const code1 = generateInternalBarcode('COFFEE-LATTE');
      const code2 = generateInternalBarcode('TEA-GREEN');
      expect(code1).not.toBe(code2);
      expect(validateEan13(code1)).toBe(true);
      expect(validateEan13(code2)).toBe(true);
    });

    it('generates a valid barcode when no seed is provided', () => {
      const code = generateInternalBarcode();
      expect(code).toHaveLength(13);
      expect(code.startsWith('200')).toBe(true);
      expect(validateEan13(code)).toBe(true);
    });
  });

  describe('generateEan13Pattern', () => {
    it('generates binary module string for 13-digit code', () => {
      const pattern = generateEan13Pattern('8850000000010');
      expect(pattern).not.toBeNull();
      // EAN-13 module count: 9 quiet + 3 guard + 42 left + 5 center + 42 right + 3 guard + 9 quiet = 113 modules
      expect(pattern?.length).toBe(113);
      expect(pattern?.startsWith('000000000101')).toBe(true);
      expect(pattern?.endsWith('101000000000')).toBe(true);
    });

    it('auto-completes 12-digit code with calculated check digit', () => {
      const pattern1 = generateEan13Pattern('885000000001');
      const pattern2 = generateEan13Pattern('8850000000010');
      expect(pattern1).toBe(pattern2);
    });

    it('returns null for invalid inputs', () => {
      expect(generateEan13Pattern('12345')).toBeNull();
      expect(generateEan13Pattern('INVALID-CODE')).toBeNull();
    });
  });

  describe('generateCode128Pattern', () => {
    it('generates binary modules for alphanumeric SKU', () => {
      const pattern = generateCode128Pattern('RUBTANG-2026');
      expect(pattern).toBeDefined();
      expect(pattern.startsWith('0000000000')).toBe(true); // 10 quiet zone
      expect(pattern.endsWith('0000000000')).toBe(true);
      expect(pattern.includes('1')).toBe(true);
    });

    it('handles special characters within ASCII 32-126', () => {
      const pattern = generateCode128Pattern('ITEM #45 / B-2');
      expect(pattern).toBeDefined();
      expect(pattern.length).toBeGreaterThan(50);
    });
  });

  describe('renderBarcodeSvg & generateBarcodeSvg', () => {
    it('renders vector SVG with rects and text', () => {
      const svg = generateBarcodeSvg('8850000000010', {
        format: 'ean13',
        height: 60,
        displayValue: true,
        fontSize: 12,
      });

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox=');
      expect(svg).toContain('<rect');
      expect(svg).toContain('<text');
      expect(svg).toContain('8850000000010');
    });

    it('omits text element when displayValue is false', () => {
      const svg = generateBarcodeSvg('SKU-12345', {
        format: 'code128',
        displayValue: false,
      });

      expect(svg).toContain('<rect');
      expect(svg).not.toContain('<text');
    });

    it('auto-detects 13-digit EAN-13 code and formats accordingly', () => {
      const svg = generateBarcodeSvg('8850000000010', { format: 'auto' });
      expect(svg).toContain('8850000000010');
      expect(svg).toContain('<svg');
    });

    it('auto-detects alphanumeric string and falls back to Code 128', () => {
      const svg = generateBarcodeSvg('SKU-ALPHA-99', { format: 'auto' });
      expect(svg).toContain('SKU-ALPHA-99');
      expect(svg).toContain('<svg');
    });

    it('respects custom barColor and backgroundColor', () => {
      const svg = generateBarcodeSvg('1234567890128', {
        barColor: '#1e3a8a',
        backgroundColor: '#f8fafc',
      });
      expect(svg).toContain('fill="#1e3a8a"');
      expect(svg).toContain('background-color: #f8fafc');
    });
  });
});
