import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Lock,
  Receipt,
  RotateCcw,
  Sparkles,
  Unlock,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { api, Branch, ShiftData } from './api';
import { DynamicStatusBadge } from './components/status-badge';

const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
});

export function ShiftDialog({
  branch,
  close,
}: {
  branch: Branch;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // Open Shift Form State
  const [openStartingCash, setOpenStartingCash] = useState('1000');
  const [openNote, setOpenNote] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  // Close Shift Form State
  const [closeActualCash, setCloseActualCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isClosingConfirm, setIsClosingConfirm] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch current shift
  const currentShiftQuery = useQuery({
    queryKey: ['current-shift', branch.id],
    queryFn: () => api<{ shift: ShiftData | null }>(`/shifts/current?branchId=${branch.id}`),
    enabled: Boolean(branch.id),
  });

  // Fetch shift history
  const historyQuery = useQuery({
    queryKey: ['shifts-history', branch.id],
    queryFn: () => api<ShiftData[]>(`/shifts?branchId=${branch.id}`),
    enabled: Boolean(branch.id) && activeTab === 'history',
  });

  // Open shift mutation
  const openShiftMutation = useMutation({
    mutationFn: (payload: { branchId: string; startingCash: string; note?: string }) =>
      api<ShiftData>('/shifts/open', payload),
    onSuccess: () => {
      setOpenError(null);
      setOpenStartingCash('1000');
      setOpenNote('');
      queryClient.invalidateQueries({ queryKey: ['current-shift', branch.id] });
      queryClient.invalidateQueries({ queryKey: ['shifts-history', branch.id] });
    },
    onError: (err: Error) => {
      setOpenError(err.message || 'เกิดข้อผิดพลาดในการเปิดกะ');
    },
  });

  // Close shift mutation
  const closeShiftMutation = useMutation({
    mutationFn: ({ shiftId, payload }: { shiftId: string; payload: { actualCash: string; note?: string } }) =>
      api<ShiftData>(`/shifts/${shiftId}/close`, payload),
    onSuccess: () => {
      setCloseError(null);
      setCloseActualCash('');
      setCloseNote('');
      setIsClosingConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['current-shift', branch.id] });
      queryClient.invalidateQueries({ queryKey: ['shifts-history', branch.id] });
      setActiveTab('history');
    },
    onError: (err: Error) => {
      setCloseError(err.message || 'เกิดข้อผิดพลาดในการปิดกะ');
    },
  });

  const currentShift = currentShiftQuery.data?.shift;

  // Handlers
  const handleOpenSubmit = (e: FormEvent) => {
    e.preventDefault();
    setOpenError(null);
    if (!openStartingCash || isNaN(Number(openStartingCash)) || Number(openStartingCash) < 0) {
      setOpenError('กรุณาระบุเงินทอนตั้งต้นที่ถูกต้อง');
      return;
    }
    openShiftMutation.mutate({
      branchId: branch.id,
      startingCash: openStartingCash,
      note: openNote.trim() || undefined,
    });
  };

  const handleCloseSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;
    setCloseError(null);
    if (!closeActualCash || isNaN(Number(closeActualCash)) || Number(closeActualCash) < 0) {
      setCloseError('กรุณาระบุจำนวนเงินสดที่นับได้จริง');
      return;
    }
    closeShiftMutation.mutate({
      shiftId: currentShift.id,
      payload: {
        actualCash: closeActualCash,
        note: closeNote.trim() || undefined,
      },
    });
  };

  // Live diff calculation
  const actualNum = closeActualCash ? Number(closeActualCash) : null;
  const expectedNum = currentShift ? currentShift.expectedCash : 0;
  const liveDiff = actualNum !== null && !isNaN(actualNum) ? actualNum - expectedNum : null;

  const tabButtonStyle = { fontSize: '12px', padding: '5px 11px', borderRadius: '6px' } as const;
  const presetButtonStyle = { fontSize: '12px', padding: '4px 10px', borderRadius: '6px' } as const;
  const cardStyle = {
    border: '1px solid #d7e5f6',
    borderRadius: '10px',
    padding: '14px',
    background: '#fff',
    display: 'grid',
    gap: '6px',
    minWidth: 0,
  } as const;
  const cardLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    color: '#607a9d',
    fontSize: '12px',
  } as const;
  const labelStyle = { margin: 0, fontSize: '12px', color: '#075dc4' } as const;
  const loadingStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '56px 16px',
    color: '#607a9d',
    textAlign: 'center',
  } as const;
  const diffTone =
    liveDiff === null
      ? null
      : liveDiff === 0
      ? { color: '#16825d', background: '#e8f8ef', border: '#bfe6d2' }
      : liveDiff > 0
      ? { color: '#e67d00', background: '#fff5df', border: '#f6d9a6' }
      : { color: '#c23f45', background: '#fff1f2', border: '#f3c7ca' };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="shift-dialog-title"
      onCancel={event => { event.preventDefault(); close(); }}
      style={{ width: 'min(820px, 96vw)', padding: 0, maxHeight: '92vh', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
      {/* Header */}
      <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid #e2ecf8', display: 'grid', gap: '12px' }}>
        <div className="section-heading" style={{ alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                width: '44px',
                height: '44px',
                flexShrink: 0,
                borderRadius: '12px',
                background: '#eaf4ff',
                color: '#0877ee',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Wallet size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow green">CASH SHIFT</span>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h2 id="shift-dialog-title" style={{ margin: 0 }}>ระบบกะเงินสดหน้าร้าน</h2>
                <span className="pill">{branch.name}</span>
              </div>
              <p className="help" style={{ margin: '4px 0 0' }}>จัดการเงินทอน บันทึกยอดขายเงินสด และกระทบยอดปิดกะ</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
            <X />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="มุมมองกะงาน" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'current'}
            onClick={() => setActiveTab('current')}
            className={activeTab === 'current' ? 'primary' : 'secondary'}
            style={tabButtonStyle}
          >
            <RotateCcw size={14} />
            กะปัจจุบัน
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={activeTab === 'history' ? 'primary' : 'secondary'}
            style={tabButtonStyle}
          >
            <History size={14} />
            ประวัติกะ
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 24px', display: 'grid', gap: '18px', alignContent: 'start' }}>
        {activeTab === 'current' ? (
          currentShiftQuery.isLoading ? (
            <div style={loadingStyle}>
              <Loader2 size={32} color="#0877ee" />
              <p style={{ margin: 0 }}>กำลังตรวจสอบสถานะกะงาน...</p>
            </div>
          ) : currentShiftQuery.isError ? (
            <div className="error" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700 }}>โหลดข้อมูลสถานะกะงานไม่สำเร็จ</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>{(currentShiftQuery.error as Error)?.message}</div>
              </div>
            </div>
          ) : currentShift ? (
            /* ACTIVE OPEN SHIFT VIEW */
            <div style={{ display: 'grid', gap: '18px' }}>
              {/* Status Header */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  border: '1px solid #bfe6d2',
                  background: '#f1fbf6',
                  borderRadius: '10px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#16825d',
                      boxShadow: '0 0 0 4px #16825d26',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <strong style={{ color: '#102f5d', fontSize: '15px' }}>กำลังเปิดใช้งานกะงาน</strong>
                      <DynamicStatusBadge domain="SHIFT" code="OPEN" fallbackLabel="เปิดอยู่" />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: '12px', color: '#607a9d', marginTop: '6px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <User size={14} />
                        ผู้เปิดกะ: <strong style={{ color: '#163d70' }}>{currentShift.cashierName}</strong>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={14} />
                        เวลาเปิด: {new Date(currentShift.openedAt).toLocaleString('th-TH')}
                      </span>
                    </div>
                  </div>
                </div>

                {currentShift.notes && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#294b76',
                      background: '#fff',
                      border: '1px solid #d7e5f6',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      maxWidth: '100%',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    💬 {currentShift.notes}
                  </div>
                )}
              </div>

              {/* 4 Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {/* 1. เงินทอน */}
                <div style={cardStyle}>
                  <div style={cardLabelStyle}>
                    <span>เงินทอนตั้งต้น</span>
                    <Banknote size={16} color="#607a9d" />
                  </div>
                  <strong className="numeric" style={{ fontSize: '18px', color: '#102f5d', textAlign: 'left' }}>
                    {money.format(currentShift.startingCash)}
                  </strong>
                  <small style={{ color: '#607a9d', fontSize: '11px' }}>เงินเริ่มต้นในลิ้นชัก</small>
                </div>

                {/* 2. ยอดขายเงินสด */}
                <div style={cardStyle}>
                  <div style={cardLabelStyle}>
                    <span>ยอดขายเงินสด</span>
                    <Banknote size={16} color="#16825d" />
                  </div>
                  <strong className="numeric positive" style={{ fontSize: '18px', textAlign: 'left' }}>
                    {money.format(currentShift.cashSales)}
                  </strong>
                  <small style={{ color: '#607a9d', fontSize: '11px' }}>
                    {currentShift.salesCount} บิลในกะนี้
                  </small>
                </div>

                {/* 3. ยอดขายโอน */}
                <div style={cardStyle}>
                  <div style={cardLabelStyle}>
                    <span>ยอดขายโอน/QR</span>
                    <Receipt size={16} color="#0877ee" />
                  </div>
                  <strong className="numeric" style={{ fontSize: '18px', color: '#0877ee', textAlign: 'left' }}>
                    {money.format(currentShift.transferSales)}
                  </strong>
                  <small style={{ color: '#607a9d', fontSize: '11px' }}>เข้าบัญชีธนาคารโดยตรง</small>
                </div>

                {/* 4. เงินที่ควรมีในลิ้นชัก */}
                <div style={{ ...cardStyle, border: '1px solid #9cc4ef', background: '#eaf4ff' }}>
                  <div style={{ ...cardLabelStyle, color: '#075dc4', fontWeight: 700 }}>
                    <span>เงินสดที่ควรมี</span>
                    <Sparkles size={16} color="#0877ee" />
                  </div>
                  <strong className="numeric" style={{ fontSize: '20px', color: '#0877ee', textAlign: 'left' }}>
                    {money.format(currentShift.expectedCash)}
                  </strong>
                  <small style={{ color: '#075dc4', fontSize: '11px' }}>เงินทอน + เงินสด</small>
                </div>
              </div>

              {/* Close Shift Form Section */}
              <section
                aria-labelledby="close-shift-title"
                style={{ border: '1px solid #d7e5f6', borderRadius: '12px', padding: '18px', background: '#f5f8ff', display: 'grid', gap: '14px' }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 12px' }}>
                  <h3 id="close-shift-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', margin: 0 }}>
                    <Lock size={18} color="#0877ee" />
                    ปิดกะงานและตรวจนับเงินสด
                  </h3>
                  <span className="help">กรุณานับเงินสดจริงทั้งหมดในลิ้นชัก</span>
                </div>

                {closeError && (
                  <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    {closeError}
                  </div>
                )}

                <form onSubmit={handleCloseSubmit} style={{ display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    <div style={{ minWidth: 0 }}>
                      <label htmlFor="shift-close-actual" style={labelStyle}>
                        เงินสดที่นับได้จริง (บาท) *
                      </label>
                      <input
                        id="shift-close-actual"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={closeActualCash}
                        onChange={(e) => setCloseActualCash(e.target.value)}
                        placeholder="0.00"
                        style={{ marginTop: '7px', fontSize: '17px', fontWeight: 700, background: '#fff' }}
                      />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setCloseActualCash(currentShift.expectedCash.toFixed(2))}
                        style={{ padding: '6px 0 0', fontSize: '12px' }}
                      >
                        ใส่ตามยอดที่ควรมี
                      </button>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <label htmlFor="shift-close-note" style={labelStyle}>
                        หมายเหตุการปิดกะ (ถ้ามี)
                      </label>
                      <input
                        id="shift-close-note"
                        type="text"
                        value={closeNote}
                        onChange={(e) => setCloseNote(e.target.value)}
                        placeholder="เช่น เงินเกิน/ขาด เพราะ..., โน้ตส่งต่อกะถัดไป"
                        style={{ marginTop: '7px', background: '#fff' }}
                      />
                    </div>
                  </div>

                  {/* Live Difference Badge */}
                  {liveDiff !== null && diffTone && (
                    <div
                      role="status"
                      className={liveDiff === 0 ? 'balanced' : 'unbalanced'}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        border: `1px solid ${diffTone.border}`,
                        background: diffTone.background,
                        color: diffTone.color,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        {liveDiff === 0 ? (
                          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                        ) : (
                          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>
                            {liveDiff === 0
                              ? 'ยอดเงินสดตรงตามระบบพอดี'
                              : liveDiff > 0
                              ? 'เงินสดเกินจากระบบ'
                              : 'เงินสดขาดจากระบบ'}
                          </div>
                          <div style={{ fontSize: '11px', opacity: 0.85 }}>
                            นับได้ {money.format(actualNum!)} (ระบบคาดหวัง {money.format(expectedNum)})
                          </div>
                        </div>
                      </div>

                      <strong className="numeric" style={{ fontSize: '18px' }}>
                        {liveDiff > 0 ? `+${money.format(liveDiff)}` : money.format(liveDiff)}
                      </strong>
                    </div>
                  )}

                  {/* Confirmation & Submit */}
                  <div className="modal-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                    <button
                      type="submit"
                      className="primary"
                      disabled={closeShiftMutation.isPending}
                      style={{ background: '#c23f45', borderColor: '#c23f45', boxShadow: '0 3px 10px #c23f4528' }}
                    >
                      {closeShiftMutation.isPending ? (
                        <>
                          <Loader2 size={16} />
                          กำลังปิดกะ...
                        </>
                      ) : (
                        <>
                          <Lock size={16} />
                          ยืนยันปิดกะงาน
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : (
            /* NO ACTIVE SHIFT: OPEN SHIFT FORM */
            <div style={{ maxWidth: '460px', width: '100%', margin: '0 auto', padding: '12px 0', display: 'grid', gap: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="empty-icon" style={{ margin: '0 auto 14px', width: '64px', height: '64px', borderRadius: '18px' }}>
                  <Unlock size={30} />
                </div>
                <h3 style={{ margin: '0 0 6px' }}>ยังไม่มีกะงานเปิดอยู่ในขณะนี้</h3>
                <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
                  กรุณาเปิดกะงานและระบุเงินทอนตั้งต้นก่อนเริ่มขายสินค้า
                </p>
              </div>

              {openError && (
                <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  {openError}
                </div>
              )}

              <form
                onSubmit={handleOpenSubmit}
                style={{ border: '1px solid #d7e5f6', borderRadius: '12px', background: '#f5f8ff', padding: '18px', display: 'grid', gap: '16px' }}
              >
                <div>
                  <label htmlFor="shift-open-cash" style={labelStyle}>
                    เงินทอนตั้งต้น (บาท) *
                  </label>
                  <input
                    id="shift-open-cash"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openStartingCash}
                    onChange={(e) => setOpenStartingCash(e.target.value)}
                    placeholder="0.00"
                    style={{ marginTop: '7px', fontSize: '17px', fontWeight: 700, background: '#fff' }}
                  />

                  {/* Preset quick buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {[500, 1000, 1500, 2000, 3000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setOpenStartingCash(String(amt))}
                        className={openStartingCash === String(amt) ? 'primary' : 'secondary'}
                        aria-pressed={openStartingCash === String(amt)}
                        style={presetButtonStyle}
                      >
                        +{amt.toLocaleString('th-TH')} บ.
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="shift-open-note" style={labelStyle}>
                    หมายเหตุเปิดกะ (ถ้ามี)
                  </label>
                  <input
                    id="shift-open-note"
                    type="text"
                    value={openNote}
                    onChange={(e) => setOpenNote(e.target.value)}
                    placeholder="เช่น กะเช้า, รับเงินทอนจากผู้จัดการ"
                    style={{ marginTop: '7px', background: '#fff' }}
                  />
                </div>

                <button
                  type="submit"
                  className="primary"
                  disabled={openShiftMutation.isPending}
                  style={{ width: '100%' }}
                >
                  {openShiftMutation.isPending ? (
                    <>
                      <Loader2 size={16} />
                      กำลังเปิดกะงาน...
                    </>
                  ) : (
                    <>
                      <Unlock size={16} />
                      เปิดกะงานและเริ่มขาย
                    </>
                  )}
                </button>
              </form>
            </div>
          )
        ) : (
          /* SHIFT HISTORY TAB */
          <section aria-labelledby="shift-history-title" style={{ display: 'grid', gap: '14px' }}>
            <div>
              <h3 id="shift-history-title" style={{ fontSize: '15px', margin: '0 0 4px' }}>ประวัติกะงานย้อนหลัง</h3>
              <p className="help" style={{ margin: 0 }}>รายการกะที่บันทึกและปิดยอดแล้ว</p>
            </div>

            {historyQuery.isLoading ? (
              <div style={loadingStyle}>
                <Loader2 size={32} color="#0877ee" />
                <p style={{ margin: 0 }}>กำลังโหลดประวัติกะงาน...</p>
              </div>
            ) : historyQuery.isError ? (
              <div className="error" role="alert">
                โหลดประวัติกะงานไม่สำเร็จ: {(historyQuery.error as Error)?.message}
              </div>
            ) : !historyQuery.data || historyQuery.data.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '220px', border: '1px dashed #d7e5f6', borderRadius: '12px' }}>
                <div className="empty-icon">
                  <History size={32} />
                </div>
                <p style={{ margin: 0, fontSize: '13px' }}>ยังไม่มีประวัติกะงานที่ปิดแล้ว</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {historyQuery.data.map((shift) => (
                  <article
                    key={shift.id}
                    style={{ border: '1px solid #d7e5f6', borderRadius: '10px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        borderBottom: '1px solid #e2ecf8',
                        paddingBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
                        <DynamicStatusBadge
                          domain="SHIFT"
                          code={shift.status}
                          fallbackLabel={shift.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดกะแล้ว'}
                        />
                        <span style={{ fontSize: '12px', color: '#607a9d' }}>
                          พนักงาน: <strong style={{ color: '#163d70' }}>{shift.cashierName}</strong>
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#607a9d' }}>
                        {new Date(shift.openedAt).toLocaleDateString('th-TH')}{' '}
                        {new Date(shift.openedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        {shift.closedAt && (
                          <span>
                            {' '}
                            - {new Date(shift.closedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '12px' }}>
                      <div style={{ background: '#f5f8ff', border: '1px solid #e2ecf8', borderRadius: '8px', padding: '9px 10px' }}>
                        <div style={{ color: '#607a9d', fontSize: '11px' }}>เงินทอนตั้งต้น</div>
                        <strong style={{ display: 'block', color: '#102f5d', marginTop: '4px' }}>{money.format(shift.startingCash)}</strong>
                      </div>

                      <div style={{ background: '#f5f8ff', border: '1px solid #e2ecf8', borderRadius: '8px', padding: '9px 10px' }}>
                        <div style={{ color: '#607a9d', fontSize: '11px' }}>ยอดขายเงินสด</div>
                        <strong className="positive" style={{ display: 'block', marginTop: '4px' }}>{money.format(shift.cashSales)}</strong>
                      </div>

                      <div style={{ background: '#f5f8ff', border: '1px solid #e2ecf8', borderRadius: '8px', padding: '9px 10px' }}>
                        <div style={{ color: '#607a9d', fontSize: '11px' }}>ควรมีในลิ้นชัก</div>
                        <strong style={{ display: 'block', color: '#0877ee', marginTop: '4px' }}>{money.format(shift.expectedCash)}</strong>
                      </div>

                      <div style={{ background: '#f5f8ff', border: '1px solid #e2ecf8', borderRadius: '8px', padding: '9px 10px' }}>
                        <div style={{ color: '#607a9d', fontSize: '11px' }}>นับได้จริง</div>
                        <strong style={{ display: 'block', color: '#102f5d', marginTop: '4px' }}>
                          {shift.actualCash !== null && shift.actualCash !== undefined
                            ? money.format(shift.actualCash)
                            : '-'}
                        </strong>
                      </div>

                      <div style={{ background: '#f5f8ff', border: '1px solid #e2ecf8', borderRadius: '8px', padding: '9px 10px' }}>
                        <div style={{ color: '#607a9d', fontSize: '11px' }}>ผลกระทบยอด</div>
                        <div style={{ marginTop: '4px' }}>
                          {shift.difference !== null && shift.difference !== undefined ? (
                            shift.difference === 0 ? (
                              <strong className="balanced">ตรงพอดี</strong>
                            ) : shift.difference > 0 ? (
                              <strong className="unbalanced">+{money.format(shift.difference)}</strong>
                            ) : (
                              <strong className="negative">{money.format(shift.difference)}</strong>
                            )
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {shift.notes && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#294b76',
                          background: '#f5f8ff',
                          border: '1px solid #e2ecf8',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        💬 {shift.notes}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      </div>
    </dialog>
  );
}
