import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Edit3,
  FileText,
  Gift,
  History,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import {
  adjustCustomerPoints,
  api,
  createLoyaltyReward,
  Customer,
  CustomerLedgerResponse,
  getCustomerLedger,
  getLoyaltyRewards,
  LoyaltyReward,
  MembershipTier,
  toggleLoyaltyReward,
} from './api';

function getTierDisplay(tier?: MembershipTier) {
  switch (tier) {
    case 'PLATINUM':
      return { label: '💎 Platinum', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' };
    case 'GOLD':
      return { label: '🥇 Gold', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' };
    case 'SILVER':
      return { label: '🥈 Silver', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };
    default:
      return { label: '🥉 Bronze', bg: '#fff7ed', color: '#9a3412', border: '#ffedd5' };
  }
}

export function CustomerDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'REWARDS'>('CUSTOMERS');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Adjust Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // New Reward Modal
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardPointsCost, setRewardPointsCost] = useState('50');
  const [rewardDiscountAmount, setRewardDiscountAmount] = useState('50.00');
  const [rewardError, setRewardError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const customersQuery = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api<Customer[]>(`/customers?${new URLSearchParams({ search })}`),
  });

  const customers = customersQuery.data ?? [];
  const selected = customers.find(c => c.id === selectedId) ?? customers[0] ?? null;

  // Selected customer ledger
  const ledgerQuery = useQuery({
    queryKey: ['customerLedger', selected?.id],
    queryFn: () => (selected ? getCustomerLedger(selected.id) : null),
    enabled: Boolean(selected?.id),
  });

  // Rewards catalog query
  const rewardsQuery = useQuery({
    queryKey: ['loyaltyRewards'],
    queryFn: () => getLoyaltyRewards(),
  });
  const rewards = rewardsQuery.data ?? [];

  const createCustomerMutation = useMutation({
    mutationFn: (data: { name: string; phone: string; note?: string }) =>
      api<Customer>('/customers', data),
    onSuccess: newCust => {
      setErrorMessage(null);
      setSelectedId(newCust.id);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('ไม่สามารถเพิ่มข้อมูลลูกค้าได้');
      }
    },
  });

  const adjustPointsMutation = useMutation({
    mutationFn: (payload: { amount: number; reason: string }) => {
      if (!selected) throw new Error('ไม่พบข้อมูลลูกค้า');
      return adjustCustomerPoints(selected.id, payload);
    },
    onSuccess: () => {
      setShowAdjustModal(false);
      setAdjustAmount('');
      setAdjustReason('');
      setAdjustError(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customerLedger', selected?.id] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) setAdjustError(err.message);
      else setAdjustError('ปรับแต้มไม่สำเร็จ');
    },
  });

  const createRewardMutation = useMutation({
    mutationFn: (payload: { title: string; pointsCost: number; discountAmount: string }) =>
      createLoyaltyReward(payload),
    onSuccess: () => {
      setShowRewardModal(false);
      setRewardTitle('');
      setRewardPointsCost('50');
      setRewardDiscountAmount('50.00');
      setRewardError(null);
      void queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) setRewardError(err.message);
      else setRewardError('เพิ่มของรางวัลไม่สำเร็จ');
    },
  });

  const toggleRewardMutation = useMutation({
    mutationFn: (rewardId: string) => toggleLoyaltyReward(rewardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loyaltyRewards'] });
    },
  });

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim();
    const note = String(formData.get('note') ?? '').trim() || undefined;

    if (!name || !phone) {
      setErrorMessage('กรุณากรอกชื่อและเบอร์โทรศัพท์');
      return;
    }

    createCustomerMutation.mutate(
      { name, phone, note },
      {
        onSuccess: () => {
          form.reset();
        },
      },
    );
  }

  function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    setAdjustError(null);
    const amt = Number(adjustAmount);
    if (!amt || isNaN(amt)) {
      setAdjustError('จำนวนแต้มต้องไม่เป็น 0');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('กรุณาระบุเหตุผล');
      return;
    }
    adjustPointsMutation.mutate({ amount: amt, reason: adjustReason.trim() });
  }

  function handleCreateRewardSubmit(e: FormEvent) {
    e.preventDefault();
    setRewardError(null);
    if (!rewardTitle.trim()) {
      setRewardError('กรุณาระบุชื่อของรางวัล');
      return;
    }
    const cost = Number(rewardPointsCost);
    if (!cost || cost <= 0) {
      setRewardError('แต้มที่ใช้แลกต้องมากกว่า 0');
      return;
    }
    createRewardMutation.mutate({
      title: rewardTitle.trim(),
      pointsCost: cost,
      discountAmount: Number(rewardDiscountAmount || 0).toFixed(2),
    });
  }

  return (
    <dialog
      ref={dialog}
      className="modal customer-preview"
      style={{ maxWidth: '960px', width: '95vw', maxHeight: '90vh' }}
      aria-labelledby="customer-dialog-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
    >
      <div className="section-heading" style={{ marginBottom: '12px' }}>
        <div>
          <span className="eyebrow green">CRM · Loyalty & Points</span>
          <h2 id="customer-dialog-title">ระบบสมาชิกลูกค้าและคะแนนสะสม</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X />
        </button>
      </div>

      {/* แท็บสลับหน้าจอ */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('CUSTOMERS')}
          className={activeTab === 'CUSTOMERS' ? 'primary' : 'secondary'}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 14px' }}
        >
          <UserRound size={16} /> สมาชิกและคะแนนสะสม ({customers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('REWARDS')}
          className={activeTab === 'REWARDS' ? 'primary' : 'secondary'}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 14px' }}
        >
          <Gift size={16} /> ของรางวัลและอัตราแลกแต้ม ({rewards.length})
        </button>
      </div>

      {activeTab === 'CUSTOMERS' ? (
        <div className="customer-layout" style={{ gap: '16px' }}>
          {/* ซ้าย: รายการลูกค้าและฟอร์มสมัคร */}
          <section>
            <div className="search customer-search">
              <Search size={18} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ หรือเบอร์โทรศัพท์…"
                aria-label="ค้นหาลูกค้า"
              />
              {customersQuery.isFetching && <Loader2 size={16} className="spin" />}
            </div>

            <div className="customer-list" style={{ maxHeight: '250px', overflowY: 'auto', margin: '10px 0' }}>
              {customers.length === 0 && !customersQuery.isLoading && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#8297b0', fontSize: '13px' }}>
                  {search ? 'ไม่พบข้อมูลลูกค้าที่ตรงกับคำค้นหา' : 'ยังไม่มีข้อมูลลูกค้าในระบบ'}
                </div>
              )}
              {customers.map(c => {
                const isSelected = selected?.id === c.id;
                const tier = getTierDisplay(c.tier);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`customer-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                    style={{ padding: '8px 10px' }}
                  >
                    <UserRound size={18} />
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong>{c.name}</strong>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '8px',
                            background: tier.bg,
                            color: tier.color,
                            border: `1px solid ${tier.border}`,
                          }}
                        >
                          {tier.label}
                        </span>
                      </div>
                      <small style={{ color: '#64748b' }}>{c.phone}</small>
                    </span>
                    <strong style={{ color: '#0877ee', fontSize: '13px' }}>{c.points.toLocaleString('th-TH')} แต้ม</strong>
                  </button>
                );
              })}
            </div>

            <form className="customer-form" onSubmit={handleCreate} style={{ display: 'grid', gap: '8px' }}>
              <strong style={{ fontSize: '12px', color: '#163d70' }}>
                ลงทะเบียนสมาชิกลูกค้าใหม่
              </strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  name="name"
                  maxLength={100}
                  required
                  placeholder="ชื่อ-นามสกุล *"
                  disabled={createCustomerMutation.isPending}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                />
                <input
                  name="phone"
                  maxLength={30}
                  required
                  placeholder="เบอร์โทรศัพท์ *"
                  disabled={createCustomerMutation.isPending}
                  style={{ fontSize: '12px', padding: '6px 8px' }}
                />
              </div>
              <input
                name="note"
                maxLength={255}
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                disabled={createCustomerMutation.isPending}
                style={{ fontSize: '12px', padding: '6px 8px' }}
              />
              {errorMessage && (
                <div role="alert" className="error" style={{ margin: '2px 0', fontSize: '11px' }}>
                  {errorMessage}
                </div>
              )}
              <button
                type="submit"
                className="secondary"
                disabled={createCustomerMutation.isPending}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px' }}
              >
                {createCustomerMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="spin" /> กำลังบันทึก…
                  </>
                ) : (
                  <>
                    <Plus size={14} /> บันทึกสมาชิกลูกค้า
                  </>
                )}
              </button>
            </form>
          </section>

          {/* ขวา: รายละเอียดสมาชิก, แต้ม, และ Point Ledger */}
          <section className="customer-detail" style={{ maxHeight: '520px', overflowY: 'auto', padding: '16px' }}>
            {selected ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div className="customer-avatar" style={{ margin: 0, width: '48px', height: '48px', fontSize: '20px' }}>
                      {selected.name.slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '17px' }}>{selected.name}</h3>
                        {(() => {
                          const t = getTierDisplay(selected.tier);
                          return (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: t.bg,
                                color: t.color,
                                border: `1px solid ${t.border}`,
                              }}
                            >
                              {t.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="muted" style={{ margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                        <Phone size={13} /> {selected.phone} · <Calendar size={13} /> สมัครเมื่อ {new Date(selected.createdAt).toLocaleDateString('th-TH')}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAdjustModal(true);
                      setAdjustAmount('');
                      setAdjustReason('');
                      setAdjustError(null);
                    }}
                    className="secondary"
                    style={{ fontSize: '12px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Sliders size={14} /> ปรับแต้มด้วยมือ
                  </button>
                </div>

                {/* KPI สรุปแต้ม */}
                <div className="loyalty-stats" style={{ gridTemplateColumns: '1fr 1fr', margin: '14px 0', gap: '10px' }}>
                  <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}>
                    <small style={{ color: '#166534', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <Award size={14} color="#16a34a" /> แต้มคงเหลือพร้อมใช้งาน
                    </small>
                    <strong style={{ fontSize: '24px', color: '#16a34a', display: 'block', marginTop: '2px' }}>
                      {selected.points.toLocaleString('th-TH')} <span style={{ fontSize: '13px' }}>แต้ม</span>
                    </strong>
                    <small style={{ fontSize: '10px', color: '#15803d' }}>
                      (มูลค่าเทียบเท่าส่วนลด {selected.points.toLocaleString('th-TH')} บาท)
                    </small>
                  </div>

                  <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center' }}>
                    <small style={{ color: '#475569', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <Sparkles size={14} color="#d97706" /> แต้มสะสมตลอดชีพ (Tier Points)
                    </small>
                    <strong style={{ fontSize: '24px', color: '#334155', display: 'block', marginTop: '2px' }}>
                      {(selected.lifetimePoints ?? selected.points).toLocaleString('th-TH')} <span style={{ fontSize: '13px' }}>แต้ม</span>
                    </strong>
                    <small style={{ fontSize: '10px', color: '#64748b' }}>
                      {selected.tier === 'PLATINUM' ? 'ระดับสูงสุด Platinum Member' :
                       selected.tier === 'GOLD' ? 'ขาดอีก 2,000 เพื่อขึ้น Platinum' :
                       selected.tier === 'SILVER' ? 'ขาดอีก 1,000 เพื่อขึ้น Gold' :
                       'ขาดอีก 300 เพื่อขึ้น Silver'}
                    </small>
                  </div>
                </div>

                {selected.note && (
                  <div style={{ background: '#f5f8ff', border: '1px solid #dbe6f4', borderRadius: '8px', padding: '8px 12px', textAlign: 'left', marginBottom: '12px', fontSize: '12px' }}>
                    <span style={{ color: '#607a9d', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', fontWeight: 600 }}>
                      <FileText size={13} /> หมายเหตุลูกค้า:
                    </span>
                    <span>{selected.note}</span>
                  </div>
                )}

                {/* ประวัติการรับ-ใช้แต้ม (Point Ledger) */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <History size={15} color="#0877ee" /> ประวัติคะแนนสะสม (Point Ledger)
                    </strong>
                    {ledgerQuery.isFetching && <Loader2 size={14} className="spin" />}
                  </div>

                  {ledgerQuery.isLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#8297b0', fontSize: '12px' }}>
                      กำลังโหลดประวัติแต้ม...
                    </div>
                  ) : (ledgerQuery.data?.ledgers ?? []).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                      ยังไม่มีประวัติการสะสมหรือใช้แต้ม
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {ledgerQuery.data?.ledgers.map(l => {
                        const isPositive = l.amount > 0;
                        const isRevert = l.type === 'REVERT';
                        const isAdjust = l.type === 'ADJUST';
                        const isRedeem = l.type === 'REDEEM';

                        return (
                          <div
                            key={l.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              background: '#fff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '12px',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '6px',
                                    background: isRedeem ? '#fef2f2' : isRevert ? '#fff7ed' : isAdjust ? '#f0fdf4' : '#eff6ff',
                                    color: isRedeem ? '#b91c1c' : isRevert ? '#c2410c' : isAdjust ? '#15803d' : '#1d4ed8',
                                  }}
                                >
                                  {isRedeem ? 'แลกส่วนลด' : isRevert ? 'คืนแต้มบิล' : isAdjust ? 'ปรับโดยแอดมิน' : 'สะสมแต้ม'}
                                </span>
                                <strong>{l.reason}</strong>
                              </div>
                              <small style={{ color: '#64748b', fontSize: '11px', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                <span>{new Date(l.createdAt).toLocaleString('th-TH')}</span>
                                {l.actorName && <span>โดย: {l.actorName}</span>}
                              </small>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ fontSize: '14px', color: isPositive ? '#16a34a' : '#dc2626' }}>
                                {isPositive ? `+${l.amount}` : l.amount} แต้ม
                              </strong>
                              <small style={{ display: 'block', color: '#64748b', fontSize: '10px' }}>
                                คงเหลือ: {l.balanceAfter} แต้ม
                              </small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="customer-empty">
                <UserRound size={34} />
                <p>เลือกลูกค้าเพื่อดูข้อมูลสะสมแต้ม</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* แท็บของรางวัล (Loyalty Rewards Catalog) */
        <div style={{ padding: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px' }}>แคตตาล็อกของรางวัลและอัตราแลกแต้ม</h3>
              <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                กำหนดรายการสิทธิประโยชน์ที่ลูกค้าสามารถใช้แต้มสะสมมาแลกได้
              </p>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setShowRewardModal(true);
                setRewardTitle('');
                setRewardPointsCost('50');
                setRewardDiscountAmount('50.00');
                setRewardError(null);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Plus size={15} /> เพิ่มของรางวัลใหม่
            </button>
          </div>

          {rewardsQuery.isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8297b0' }}>
              กำลังโหลดรายการของรางวัล...
            </div>
          ) : rewards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '8px', color: '#94a3b8' }}>
              ยังไม่มีของรางวัลในระบบ กดปุ่ม "เพิ่มของรางวัลใหม่" ด้านบนเพื่อเริ่มสร้าง
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {rewards.map(r => (
                <div
                  key={r.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px',
                    opacity: r.active ? 1 : 0.6,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: '14px', color: '#1e293b' }}>{r.title}</strong>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '8px',
                          background: r.active ? '#f0fdf4' : '#f1f5f9',
                          color: r.active ? '#15803d' : '#64748b',
                        }}
                      >
                        {r.active ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                      </span>
                    </div>

                    <div style={{ marginTop: '10px', display: 'flex', gap: '14px' }}>
                      <div>
                        <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>แต้มที่ใช้แลก</small>
                        <strong style={{ color: '#d97706', fontSize: '16px' }}>{r.pointsCost} แต้ม</strong>
                      </div>
                      <div>
                        <small style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>มูลค่าส่วนลด</small>
                        <strong style={{ color: '#0877ee', fontSize: '16px' }}>
                          {Number(r.discountAmount) > 0 ? `${Number(r.discountAmount).toLocaleString('th-TH')} บาท` : 'ของรางวัล/ฟรี'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => toggleRewardMutation.mutate(r.id)}
                      disabled={toggleRewardMutation.isPending}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {r.active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal ปรับแต้มด้วยมือ (Manual Points Adjustment) */}
      {showAdjustModal && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '420px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={18} color="#0877ee" /> ปรับแต้มสะสม: {selected.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="icon-button"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="muted" style={{ fontSize: '12px', margin: '0 0 14px 0' }}>
              แต้มคงเหลือปัจจุบัน: <strong style={{ color: '#0877ee' }}>{selected.points} แต้ม</strong>
            </p>

            <form onSubmit={handleAdjustSubmit} style={{ display: 'grid', gap: '10px' }}>
              <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
                <span>จำนวนแต้มที่ต้องการปรับ (+ หรือ -) *</span>
                <input
                  type="number"
                  required
                  placeholder="เช่น 50 (เพิ่ม) หรือ -20 (ลด)"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>

              <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
                <span>เหตุผลในการปรับแต้ม *</span>
                <input
                  type="text"
                  required
                  placeholder="เช่น ลูกค้าVIP ปรับแต้มชดเชย หรือ แต้มหมดอายุ"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>

              {adjustError && (
                <div role="alert" className="error" style={{ fontSize: '12px', margin: '2px 0' }}>
                  {adjustError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAdjustModal(false)}
                  disabled={adjustPointsMutation.isPending}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={adjustPointsMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {adjustPointsMutation.isPending && <Loader2 size={14} className="spin" />}
                  ยืนยันการปรับแต้ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal เพิ่มของรางวัลใหม่ (Add Loyalty Reward) */}
      {showRewardModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '440px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Gift size={18} color="#0877ee" /> เพิ่มของรางวัลสำหรับแลกแต้ม
              </h3>
              <button
                type="button"
                onClick={() => setShowRewardModal(false)}
                className="icon-button"
                style={{ padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateRewardSubmit} style={{ display: 'grid', gap: '10px' }}>
              <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
                <span>ชื่อของรางวัล / สิทธิประโยชน์ *</span>
                <input
                  type="text"
                  required
                  placeholder="เช่น ส่วนลดเงินสด 50 บาท, แก้วน้ำ RubTang"
                  value={rewardTitle}
                  onChange={e => setRewardTitle(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
                  <span>แต้มที่ต้องใช้แลก *</span>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="เช่น 50"
                    value={rewardPointsCost}
                    onChange={e => setRewardPointsCost(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>

                <label style={{ fontSize: '12px', display: 'grid', gap: '4px' }}>
                  <span>มูลค่าส่วนลด (บาท)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="เช่น 50.00 หรือ 0"
                    value={rewardDiscountAmount}
                    onChange={e => setRewardDiscountAmount(e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </label>
              </div>

              {rewardError && (
                <div role="alert" className="error" style={{ fontSize: '12px', margin: '2px 0' }}>
                  {rewardError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowRewardModal(false)}
                  disabled={createRewardMutation.isPending}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={createRewardMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {createRewardMutation.isPending && <Loader2 size={14} className="spin" />}
                  บันทึกของรางวัล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </dialog>
  );
}
