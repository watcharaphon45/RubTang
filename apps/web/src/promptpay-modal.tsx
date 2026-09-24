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
  Zap,
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
    <div className="modal-backdrop" style={{ zIndex: 50 }}>
      {/* Modal Container */}
      <div
        className="modal promptpay-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promptpay-modal-title"
        style={{
          width: isFullscreen ? '100vw' : 'min(520px, 96vw)',
          maxHeight: isFullscreen ? '100vh' : '94vh',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: isFullscreen ? 0 : undefined,
        }}
      >
        {/* ─── Header ─── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0753bd, #0877ee)',
            color: '#fff',
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,.12)',
                border: '1px solid rgba(255,255,255,.2)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <QrCode size={22} color="#90cdf4" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '1.5px',
                    color: '#90cdf4',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  PROMPTPAY
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    background: 'rgba(144,205,244,.15)',
                    color: '#bfe3ff',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    fontWeight: 700,
                  }}
                >
                  DYNAMIC QR
                </span>
              </div>
              <h2
                id="promptpay-modal-title"
                style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: '2px 0 0' }}
              >
                สแกนจ่ายผ่านพร้อมเพย์
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'ย่อหน้าจอ' : 'หันหน้าจอให้ลูกค้า (Customer Display)'}
              className="icon-button"
              style={{ color: 'rgba(255,255,255,.8)' }}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              className="icon-button"
              style={{ color: 'rgba(255,255,255,.8)' }}
              aria-label="ปิด"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ─── Body ─── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            background: '#f5f8ff',
          }}
        >
          {/* Amount Badge */}
          <div
            style={{
              width: '100%',
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #d7e5f6',
              borderRadius: '10px',
              padding: '14px 16px',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#607a9d', display: 'block', marginBottom: '2px' }}>
              ยอดเงินที่ต้องชำระ (Net Payable)
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#0877ee' }}>฿</span>
              <span style={{ fontSize: '34px', fontWeight: 900, color: '#102f5d', letterSpacing: '-0.5px' }}>
                {formattedAmount}
              </span>
            </div>
          </div>

          {/* QR Code Presentation Box */}
          <div
            style={{
              position: 'relative',
              padding: '20px',
              background: '#fff',
              border: '2px solid #cfe1f7',
              borderRadius: '14px',
              boxShadow: '0 8px 30px rgba(8,119,238,.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              maxWidth: '300px',
              width: '100%',
            }}
          >
            {/* PromptPay Top Branding Emblem */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px',
                padding: '4px 12px',
                background: '#eaf4ff',
                border: '1px solid #cfe1f7',
                borderRadius: '20px',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#16825d',
                  display: 'inline-block',
                  animation: 'spin 2s linear infinite',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0753bd', letterSpacing: '0.3px' }}>
                สแกนได้ทุกแอปธนาคาร
              </span>
            </div>

            {/* QR SVG */}
            <div
              style={{
                width: '220px',
                height: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                border: '1px solid #e2ecf8',
                borderRadius: '10px',
                background: '#fff',
                boxShadow: 'inset 0 1px 3px rgba(7,83,189,.04)',
              }}
            >
              {qrSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <span className="muted small" style={{ animation: 'spin 1s linear infinite' }}>
                  กำลังสร้าง QR Code...
                </span>
              )}
            </div>

            {/* Account Info Details */}
            <div style={{ marginTop: '12px', width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#102f5d' }}>{accountName}</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#607a9d',
                  marginTop: '4px',
                }}
              >
                <span>{bankName}</span>
                <span>•</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{maskedTarget}</span>
                <button
                  onClick={handleCopyTarget}
                  className="icon-button"
                  title="คัดลอกหมายเลข"
                  style={{ padding: '3px', color: '#607a9d' }}
                >
                  <Copy size={12} />
                </button>
              </div>
              {copied && (
                <span style={{ fontSize: '10px', color: '#16825d', fontWeight: 700, display: 'block', marginTop: '2px' }}>
                  คัดลอกหมายเลขแล้ว!
                </span>
              )}
            </div>

            {/* Session Timer Footer */}
            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid #e2ecf8',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#607a9d',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> เวลาที่เหลือ:
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: secondsRemaining < 60 ? '#c94a4a' : '#102f5d',
                  animation: secondsRemaining < 60 ? 'spin 1s steps(2) infinite' : undefined,
                }}
              >
                {formattedTimer} นาที
              </span>
            </div>
          </div>

          {/* Verification Status Banner / Slip Check */}
          <div style={{ width: '100%', maxWidth: '300px' }}>
            {verificationResult?.verified ? (
              <div
                style={{
                  padding: '12px 14px',
                  background: '#e8f8ef',
                  border: '1px solid #b6e2c9',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#16825d',
                }}
              >
                <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px' }}>
                  <div style={{ fontWeight: 700 }}>รับชำระเงินสำเร็จ!</div>
                  <div style={{ fontSize: '11px', color: '#218254', marginTop: '2px' }}>
                    อ้างอิง: {verificationResult.transferRef}
                  </div>
                </div>
              </div>
            ) : verificationResult?.verified === false ? (
              <div className="error" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700 }}>ตรวจสอบไม่ผ่าน</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>{verificationResult.reason}</div>
                </div>
              </div>
            ) : null}

            {/* Slip Verification Box */}
            <div
              style={{
                marginTop: '10px',
                background: '#fff',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid #d7e5f6',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: '#102f5d', fontSize: '12px' }}>
                  ตรวจสอบสลิป / เลขอ้างอิงโอนเงิน
                </span>
                <button
                  type="button"
                  onClick={handleSimulateQuickPayment}
                  className="text-button small"
                  title="จำลองเหตุการณ์ลูกค้าสแกนจ่ายสำเร็จ"
                  style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <Zap size={11} /> จำลองจ่ายสำเร็จ
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="ระบุเลขอ้างอิงสลิป เช่น KBANK123456"
                  value={transferRefInput}
                  onChange={(e) => setTransferRefInput(e.target.value)}
                  style={{ flex: 1, fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={isVerifying}
                  className="secondary"
                  style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: '12px' }}
                >
                  {isVerifying ? 'กำลังตรวจ...' : 'ตรวจสลิป'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="modal-actions" style={{ padding: '14px 22px', margin: 0, borderTop: '1px solid #e2ecf8' }}>
          <button type="button" className="secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleConfirm}
            style={{ gap: '6px' }}
          >
            <ShieldCheck size={16} />
            <span>ยืนยันรับเงิน ฿{formattedAmount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
