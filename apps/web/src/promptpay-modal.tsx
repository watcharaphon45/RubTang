import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  QrCode,
  ShieldCheck,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { Branch, getBranchPromptPay, verifySlip, VerifySlipResult } from './api';
import {
  generatePromptPayPayload,
  generatePromptPayQrSvg,
  playSuccessChime,
} from './promptpay-engine';

interface PromptPayModalProps {
  branch: Branch;
  amount: number;
  ref1?: string;
  onConfirmPayment: (paymentDetail: {
    transferRef: string;
    verified: boolean;
    accountName: string;
    promptPayAccount: string;
  }) => void;
  onClose: () => void;
}

export function PromptPayModal({
  branch,
  amount,
  ref1,
  onConfirmPayment,
  onClose,
}: PromptPayModalProps) {
  // Query branch PromptPay details
  const { data: branchPp, isPending } = useQuery({
    queryKey: ['branch-promptpay', branch.id],
    queryFn: () => getBranchPromptPay(branch.id),
  });

  const [qrSvg, setQrSvg] = useState<string>('');
  const [payloadString, setPayloadString] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutes timer
  const [transferRefInput, setTransferRefInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerifySlipResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);

  // Default target fallback if not yet set in branch
  const target = branchPp?.promptPayAccount || '0812345678';
  const targetType = branchPp?.promptPayType || 'MOBILE';
  const accountName = branchPp?.promptPayName || branch.name;
  const bankName = branchPp?.promptPayBank || 'PromptPay';

  // Build Payload & SVG
  useEffect(() => {
    if (amount <= 0) return;
    try {
      const payload = generatePromptPayPayload({
        target,
        targetType,
        amount,
        ref1: ref1 || `REC${Date.now().toString().slice(-6)}`,
      });
      setPayloadString(payload);

      generatePromptPayQrSvg(payload, {
        margin: 1,
        color: { dark: '#0b2046', light: '#ffffff' },
      }).then((svg) => {
        setQrSvg(svg);
      });
    } catch (err) {
      console.error('Error generating PromptPay QR:', err);
    }
  }, [target, targetType, amount, ref1]);

  // 5-minute countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [secondsRemaining]);

  const formattedAmount = useMemo(() => {
    return amount.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [amount]);

  // Masked target (e.g. 081-xxx-5678)
  const maskedTarget = useMemo(() => {
    const raw = target.replace(/\D/g, '');
    if (raw.length === 10) {
      return `${raw.slice(0, 3)}-xxx-${raw.slice(6)}`;
    }
    if (raw.length === 13) {
      return `${raw.slice(0, 1)}-xxxx-xxxxx-${raw.slice(10)}`;
    }
    return target;
  }, [target]);

  const handleCopyTarget = () => {
    navigator.clipboard.writeText(target);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualVerify = async () => {
    const refToTest = transferRefInput.trim() || `KBANK${Date.now().toString().slice(-8)}`;
    setIsVerifying(true);
    try {
      const res = await verifySlip({
        expectedAmount: amount,
        transferRef: refToTest,
      });
      setVerificationResult(res);
      if (res.verified) {
        setAutoVerified(true);
        playSuccessChime();
      }
    } catch (err: any) {
      setVerificationResult({
        verified: false,
        reason: err?.message || 'ไม่สามารถตรวจสอบสลิปได้',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSimulateQuickPayment = () => {
    const simRef = `SCB${Date.now().toString().slice(-8)}`;
    setTransferRefInput(simRef);
    setAutoVerified(true);
    setVerificationResult({
      verified: true,
      transferRef: simRef,
      matchedAmount: amount,
      verifiedAt: new Date().toISOString(),
      message: 'ตรวจสอบพบเงินเข้าบัญชีเรียบร้อย ยอดเงินตรงกัน',
    });
    playSuccessChime();
  };

  const handleConfirm = () => {
    const finalRef =
      verificationResult?.transferRef ||
      transferRefInput.trim() ||
      `PP${Date.now().toString().slice(-8)}`;

    onConfirmPayment({
      transferRef: finalRef,
      verified: Boolean(verificationResult?.verified),
      accountName,
      promptPayAccount: target,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
      {/* Modal Container */}
      <div
        className={`bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 transition-all duration-300 ${
          isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-full max-w-lg max-h-[92vh]'
        }`}
      >
        {/* Header with PromptPay Official Style */}
        <div className="bg-gradient-to-r from-[#0b2046] via-[#10326e] to-[#0b2046] text-white px-6 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center p-1.5 border border-white/20">
              <QrCode className="w-full h-full text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-wider uppercase text-sky-400">
                  PROMPTPAY
                </span>
                <span className="text-[10px] bg-sky-500/20 text-sky-200 px-2 py-0.5 rounded-full font-bold">
                  DYNAMIC QR
                </span>
              </div>
              <h2 className="text-base font-bold text-white">สแกนจ่ายผ่านพร้อมเพย์</h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'ย่อหน้าจอ' : 'หันหน้าจอให้ลูกค้า (Customer Display)'}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center bg-slate-50">
          
          {/* Amount Badge */}
          <div className="w-full text-center bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm mb-4">
            <span className="text-xs font-semibold text-slate-500 block mb-0.5">
              ยอดเงินที่ต้องชำระ (Net Payable)
            </span>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-xl font-bold text-indigo-600">฿</span>
              <span className="text-4xl font-black text-slate-900 tracking-tight">
                {formattedAmount}
              </span>
            </div>
          </div>

          {/* QR Code Presentation Box */}
          <div className="relative p-5 bg-white border-2 border-indigo-100 rounded-3xl shadow-xl flex flex-col items-center max-w-xs w-full">
            {/* PromptPay Top Branding Emblem */}
            <div className="flex items-center gap-1.5 mb-3 px-3 py-1 bg-sky-50 border border-sky-100 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-sky-900 tracking-wide">
                สแกนได้ทุกแอปธนาคาร
              </span>
            </div>

            {/* QR SVG */}
            <div className="w-56 h-56 flex items-center justify-center p-2 border border-slate-100 rounded-2xl bg-white shadow-inner">
              {qrSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  className="w-full h-full"
                />
              ) : (
                <div className="text-xs text-slate-400 animate-pulse">กำลังสร้าง QR Code...</div>
              )}
            </div>

            {/* Account Info Details */}
            <div className="mt-3 w-full text-center space-y-1">
              <div className="text-xs font-bold text-slate-800 truncate">{accountName}</div>
              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                <span>{bankName}</span>
                <span>•</span>
                <span className="font-mono font-medium">{maskedTarget}</span>
                <button
                  onClick={handleCopyTarget}
                  className="p-1 hover:text-indigo-600 text-slate-400 transition-colors"
                  title="คัดลอกหมายเลข"
                >
                  <Copy size={12} />
                </button>
              </div>
              {copied && (
                <span className="text-[10px] text-emerald-600 font-bold block">
                  คัดลอกหมายเลขแล้ว!
                </span>
              )}
            </div>

            {/* Session Timer Footer */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 w-full flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock size={12} /> เวลาที่เหลือ:
              </span>
              <span className={`font-mono font-bold ${secondsRemaining < 60 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
                {formattedTimer} นาที
              </span>
            </div>
          </div>

          {/* Verification Status Banner / Slip Check */}
          <div className="w-full max-w-xs mt-4">
            {verificationResult?.verified ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-900 shadow-sm animate-fade-in">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold">รับชำระเงินสำเร็จ!</div>
                  <div className="text-[11px] text-emerald-700">
                    อ้างอิง: {verificationResult.transferRef}
                  </div>
                </div>
              </div>
            ) : verificationResult?.verified === false ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-red-900 text-xs">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="font-bold">ตรวจสอบไม่ผ่าน</div>
                  <div className="text-[10px] text-red-700">{verificationResult.reason}</div>
                </div>
              </div>
            ) : null}

            {/* Slip Verification Box */}
            <div className="mt-3 bg-white p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 text-[11px]">
                  ตรวจสอบสลิป / เลขอ้างอิงโอนเงิน
                </span>
                <button
                  type="button"
                  onClick={handleSimulateQuickPayment}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                  title="จำลองเหตุการณ์ลูกค้าสแกนจ่ายสำเร็จ"
                >
                  ⚡ จำลองลูกค้าจ่ายสำเร็จ
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ระบุเลขอ้างอิงสลิป เช่น KBANK123456"
                  value={transferRefInput}
                  onChange={(e) => setTransferRefInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={isVerifying}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors disabled:bg-slate-400"
                >
                  {isVerifying ? 'กำลังตรวจ...' : 'ตรวจสลิป'}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition-all flex items-center gap-2"
          >
            <ShieldCheck size={16} />
            <span>ยืนยันรับเงิน ฿{formattedAmount}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
