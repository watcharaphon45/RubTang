import QRCode from 'qrcode';

/**
 * RubTang PromptPay EMVCo Engine & Web Audio Chime
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

  // Mobile: 08x-xxx-xxxx -> 00668xxxxxxxx (13 chars)
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

  // Tag 62: Additional Data Field (Reference/Bill No)
  if (ref1) {
    const cleanRef = ref1.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (cleanRef) {
      const subtag07 = formatTlv('07', cleanRef);
      payload += formatTlv('62', subtag07);
    }
  }

  // Tag 63: CRC-16 Checksum
  const partial = `${payload}6304`;
  const checksum = crc16(partial);

  return `${partial}${checksum}`;
}

/**
 * Generate standard SVG QR Code string for PromptPay payload
 */
export async function generatePromptPayQrSvg(
  payload: string,
  options: { margin?: number; color?: { dark?: string; light?: string } } = {}
): Promise<string> {
  const {
    margin = 2,
    color = { dark: '#0b2046', light: '#ffffff' },
  } = options;

  return QRCode.toString(payload, {
    type: 'svg',
    margin,
    color,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Web Audio API Sound Synthesizer:
 * Plays a pleasant, crisp dual-tone notification chime ("ding-dong")
 * when a payment or slip is successfully verified!
 */
export function playSuccessChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Tone 2: A5 (880 Hz) - higher pitch confirmation
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);
  } catch (err) {
    // Graceful fallback if AudioContext is blocked by browser policy
    console.debug('Audio chime playback omitted:', err);
  }
}
