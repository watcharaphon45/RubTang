export function bahtText(input: number | string): string {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  if (!Number.isFinite(num)) return 'ศูนย์บาทถ้วน';
  if (num === 0) return 'ศูนย์บาทถ้วน';
  if (num < 0) return `ลบ${bahtText(Math.abs(num))}`;

  const fixed = num.toFixed(2);
  const [bahtStr, stangStr] = fixed.split('.');
  const wholeBaht = parseInt(bahtStr, 10);

  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  function readBlock(str: string, isLowestChunk: boolean, wholeValue: number): string {
    let result = '';
    const len = str.length;
    const chunkVal = parseInt(str, 10);
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i], 10);
      const pos = len - i - 1;
      if (digit !== 0) {
        if (pos === 1 && digit === 1) {
          result += 'สิบ';
        } else if (pos === 1 && digit === 2) {
          result += 'ยี่สิบ';
        } else if (pos === 0 && digit === 1) {
          if (isLowestChunk) {
            result += wholeValue > 1 ? 'เอ็ด' : 'หนึ่ง';
          } else {
            result += chunkVal > 1 ? 'เอ็ด' : 'หนึ่ง';
          }
        } else {
          result += digits[digit] + units[pos];
        }
      }
    }
    return result;
  }

  function readBaht(str: string): string {
    if (str === '0' || !str) return '';
    let rem = str;
    const chunks: string[] = [];
    while (rem.length > 6) {
      chunks.unshift(rem.slice(-6));
      rem = rem.slice(0, -6);
    }
    chunks.unshift(rem);

    let result = '';
    for (let i = 0; i < chunks.length; i++) {
      const isLowest = i === chunks.length - 1;
      const chunkText = readBlock(chunks[i], isLowest, wholeBaht);
      if (chunkText) {
        result += chunkText;
        if (i < chunks.length - 1) {
          result += 'ล้าน';
        }
      }
    }
    return result;
  }

  const bahtTextPart = readBaht(bahtStr);
  const stang = parseInt(stangStr, 10);

  if (stang === 0) {
    return (bahtTextPart || 'ศูนย์') + 'บาทถ้วน';
  }

  const stangTextPart = readBlock(stangStr, true, stang);
  return (bahtTextPart ? `${bahtTextPart}บาท` : '') + `${stangTextPart}สตางค์`;
}

export function calculateVat(netAmount: number, rate = 7) {
  const taxableAmount = Math.round((netAmount * 100 / (100 + rate)) * 100) / 100;
  const vatAmount = Math.round((netAmount - taxableAmount) * 100) / 100;
  return {
    taxableAmount: taxableAmount.toFixed(2),
    vatAmount: vatAmount.toFixed(2),
    vatRate: rate.toFixed(2),
  };
}
