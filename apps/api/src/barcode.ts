/**
 * RubTang Barcode Engine
 * Pure Vector SVG Barcode Generator for Retail POS & Inventory.
 * Supports Code 128 (Alphanumeric/SKU) and EAN-13 (Standard retail GTIN).
 */

export interface BarcodeOptions {
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  barColor?: string;
  backgroundColor?: string;
}

// ==========================================
// EAN-13 Engine
// ==========================================

const EAN_L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const EAN_G_CODES = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];

const EAN_R_CODES = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];

// 1st digit determines the parity sequence of digits 2-7
const EAN_STRUCTURE = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

export function calculateEan13Checksum(first12Digits: string): number {
  if (first12Digits.length < 12) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12Digits[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateEan13(code: string): boolean {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 13) return false;
  const expectedCheck = calculateEan13Checksum(clean.slice(0, 12));
  return parseInt(clean[12], 10) === expectedCheck;
}

export function generateInternalBarcode(seed?: number | string): string {
  // Retail standard internal barcode prefix: 200 (in-store use according to GS1)
  let numStr = '';
  if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
    const raw = String(seed).trim();
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      numStr = digitsOnly;
    } else {
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
      }
      numStr = `${digitsOnly}${hash}`;
    }
  } else {
    numStr = `${Date.now()}`;
  }
  const padded = numStr.padStart(9, '0').slice(-9);
  const first12 = `200${padded}`;
  const check = calculateEan13Checksum(first12);
  return `${first12}${check}`;
}

export function generateEan13Pattern(code: string): string | null {
  const clean = code.replace(/\D/g, '');
  let fullCode = clean;
  if (clean.length === 12) {
    fullCode = `${clean}${calculateEan13Checksum(clean)}`;
  } else if (clean.length !== 13) {
    return null;
  }

  const firstDigit = parseInt(fullCode[0], 10);
  const structure = EAN_STRUCTURE[firstDigit];
  if (!structure) return null;

  let pattern = '';

  // Quiet zone + Left guard
  pattern += '000000000'; // 9 modules quiet
  pattern += '101'; // Left guard

  // Left 6 digits
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 1], 10);
    const type = structure[i];
    pattern += type === 'L' ? EAN_L_CODES[digit] : EAN_G_CODES[digit];
  }

  // Center guard
  pattern += '01010';

  // Right 6 digits (R codes)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(fullCode[i + 7], 10);
    pattern += EAN_R_CODES[digit];
  }

  // Right guard + Quiet zone
  pattern += '101';
  pattern += '000000000';

  return pattern;
}

// ==========================================
// Code 128 Engine (Subset B / General Retail)
// ==========================================

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (104=Start B, 106=Stop)
];

function widthsToModules(widths: string): string {
  let result = '';
  let isBar = true;
  for (let i = 0; i < widths.length; i++) {
    const count = parseInt(widths[i], 10);
    result += (isBar ? '1' : '0').repeat(count);
    isBar = !isBar;
  }
  return result;
}

export function generateCode128Pattern(text: string): string {
  const startCode = 104;
  const values: number[] = [startCode];

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      values.push(code - 32);
    } else {
      values.push(63);
    }
  }

  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum += values[i] * i;
  }
  const checkDigit = checksum % 103;
  values.push(checkDigit);
  values.push(106);

  let pattern = '0000000000';
  for (const val of values) {
    const widths = CODE128_PATTERNS[val];
    pattern += widthsToModules(widths);
  }
  pattern += '0000000000';

  return pattern;
}

// ==========================================
// SVG Rendering Functions
// ==========================================

export function renderBarcodeSvg(
  pattern: string,
  displayCode: string,
  options: BarcodeOptions = {}
): string {
  const {
    height = 50,
    displayValue = true,
    fontSize = 11,
    barColor = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const moduleWidth = 2;
  const totalWidth = pattern.length * moduleWidth;
  const barHeight = displayValue ? height - (fontSize + 6) : height;

  let rects = '';
  let inBar = false;
  let startX = 0;

  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      if (!inBar) {
        inBar = true;
        startX = i * moduleWidth;
      }
    } else {
      if (inBar) {
        const barWidth = i * moduleWidth - startX;
        rects += `<rect x="${startX}" y="2" width="${barWidth}" height="${barHeight}" fill="${barColor}" />`;
        inBar = false;
      }
    }
  }

  if (inBar) {
    const barWidth = pattern.length * moduleWidth - startX;
    rects += `<rect x="${startX}" y="2" width="${barWidth}" height="${barHeight}" fill="${barColor}" />`;
  }

  let textElement = '';
  if (displayValue && displayCode) {
    const textY = barHeight + fontSize + 2;
    textElement = `<text x="${totalWidth / 2}" y="${textY}" font-family="monospace, -apple-system, sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" fill="${barColor}" letter-spacing="1.5">${displayCode}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" style="background-color: ${backgroundColor}; display: block;">
    ${rects}
    ${textElement}
  </svg>`;
}

export function generateBarcodeSvg(
  code: string,
  options: BarcodeOptions & { format?: 'auto' | 'code128' | 'ean13' } = {}
): string {
  const clean = String(code).trim();
  const format = options.format || 'auto';

  if (format === 'ean13' || (format === 'auto' && /^\d{12,13}$/.test(clean))) {
    const eanPattern = generateEan13Pattern(clean);
    if (eanPattern) {
      const fullCode = clean.length === 12 ? `${clean}${calculateEan13Checksum(clean)}` : clean;
      return renderBarcodeSvg(eanPattern, fullCode, options);
    }
  }

  const code128Pattern = generateCode128Pattern(clean);
  return renderBarcodeSvg(code128Pattern, clean, options);
}
