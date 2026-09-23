import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgePercent,
  Building2,
  CheckCircle2,
  Loader2,
  Percent,
  Plus,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import { api, Branch, Profile, PromotionData, ValidatePromotionResult } from './api';
import { AppSelect } from './components/app-select';

const tabButtonStyle: CSSProperties = {
  fontSize: '12px',
  padding: '5px 11px',
  borderRadius: '6px',
  gap: '6px',
};

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  margin: 0,
  fontSize: '12px',
  fontWeight: 600,
  color: '#163d70',
};

const fieldInputStyle: CSSProperties = {
  marginTop: '6px',
  borderColor: '#cfe0f5',
  padding: '10px 12px',
};

const cardStyle: CSSProperties = {
  border: '1px solid #d7e5f6',
  borderRadius: '10px',
  padding: '18px',
  background: '#fff',
};

const statBoxStyle: CSSProperties = {
  background: '#f5f8ff',
  border: '1px solid #e2ecf8',
  borderRadius: '8px',
  padding: '10px 12px',
  minWidth: 0,
};


const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
});

export function PromotionDialog({
  branch,
  profile,
  close,
}: {
  branch: Branch;
  profile: Profile;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'test'>('list');
  const [notice, setNotice] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [minSpend, setMinSpend] = useState('0');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Test coupon state
  const [testCode, setTestCode] = useState('RUBTANG50');
  const [testSubtotal, setTestSubtotal] = useState('350');
  const [testResult, setTestResult] = useState<ValidatePromotionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch promotions
  const promotionsQuery = useQuery({
    queryKey: ['promotions', branch.id],
    queryFn: () => api<PromotionData[]>('/promotions'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      code?: string;
      discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
      discountValue: string;
      minSpend: string;
      maxDiscount?: string;
      branchId?: string;
    }) => api<PromotionData>('/promotions', payload),
    onSuccess: (data) => {
      setCreateError(null);
      setName('');
      setCode('');
      setDiscountValue('10');
      setMinSpend('0');
      setMaxDiscount('');
      setNotice(`สร้างโปรโมชัน "${data.name}" เรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      setActiveTab('list');
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'บันทึกโปรโมชันไม่สำเร็จ');
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<PromotionData>(`/promotions/${id}`, { active }),
    onSuccess: (data) => {
      setNotice(`เปลี่ยนสถานะ "${data.name}" เป็น ${data.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} แล้ว`);
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
    },
    onError: (err: Error) => {
      setNotice(`เกิดข้อผิดพลาด: ${err.message}`);
    },
  });

  // Test coupon mutation
  const validateMutation = useMutation({
    mutationFn: (payload: { code: string; branchId: string; subtotal: string }) =>
      api<ValidatePromotionResult>('/promotions/validate', payload),
    onSuccess: (res) => {
      setTestResult(res);
      setTestError(null);
    },
    onError: (err: Error) => {
      setTestResult(null);
      setTestError(err.message || 'รหัสคูปองไม่ถูกต้องหรือไม่ผ่านเงื่อนไข');
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!name.trim()) {
      setCreateError('กรุณาระบุชื่อโปรโมชัน');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      code: code.trim().toUpperCase() || undefined,
      discountType,
      discountValue,
      minSpend: minSpend || '0',
      maxDiscount: discountType === 'PERCENTAGE' && maxDiscount ? maxDiscount : undefined,
      branchId: targetBranchId || undefined,
    });
  };

  const handleTestSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTestError(null);
    setTestResult(null);
    if (!testCode.trim()) return;
    validateMutation.mutate({
      code: testCode.trim().toUpperCase(),
      branchId: branch.id,
      subtotal: testSubtotal || '0',
    });
  };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="promotion-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      style={{ width: 'min(960px, 96vw)', maxHeight: '92vh', padding: '24px' }}
    >
      {/* Header */}
      <div className="section-heading" style={{ alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow green" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <BadgePercent size={14} aria-hidden="true" />
            PROMOTIONS & COUPONS
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            <h2 id="promotion-dialog-title" style={{ margin: 0 }}>ระบบโปรโมชันและคูปองส่วนลด</h2>
            <span className="pill">{branch.name}</span>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
          <X />
        </button>
      </div>
      <p className="muted" style={{ margin: '6px 0 14px', fontSize: '13px' }}>
        ตั้งค่าส่วนลด % หรือบาท กำหนดยอดซื้อขั้นต่ำ และจัดการรหัสคูปอง
      </p>

      {/* Tabs */}
      <div role="tablist" aria-label="เมนูโปรโมชัน" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'list'}
          onClick={() => { setActiveTab('list'); setNotice(null); }}
          className={activeTab === 'list' ? 'primary' : 'secondary'}
          style={tabButtonStyle}
        >
          <BadgePercent size={14} />
          รายการโปรโมชัน
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'create'}
          onClick={() => { setActiveTab('create'); setNotice(null); }}
          className={activeTab === 'create' ? 'primary' : 'secondary'}
          style={tabButtonStyle}
        >
          <Plus size={14} />
          สร้างโปรโมชัน
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'test'}
          onClick={() => { setActiveTab('test'); setNotice(null); }}
          className={activeTab === 'test' ? 'primary' : 'secondary'}
          style={tabButtonStyle}
        >
          <Ticket size={14} />
          ทดสอบคูปอง
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="success"
          style={{
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: '8px',
            background: '#eaf4ff',
            border: '1px solid #d2e4fb',
            margin: '0 0 14px',
            fontSize: '13px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            {notice}
          </span>
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="ปิดข้อความ" style={{ padding: '2px', color: '#0877ee' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Body */}
      <div>
        {activeTab === 'list' ? (
          /* ALL PROMOTIONS LIST */
          <section aria-labelledby="promotion-list-title" style={{ display: 'grid', gap: '14px' }}>
            <div>
              <h3 id="promotion-list-title" style={{ fontSize: '15px', margin: '0 0 4px' }}>โปรโมชันทั้งหมด</h3>
              <p className="help" style={{ margin: 0 }}>เงื่อนไขส่วนลดที่สามารถใช้กับยอดขายหน้าร้านได้</p>
            </div>

            {promotionsQuery.isLoading ? (
              <div className="empty-state" style={{ minHeight: '220px' }}>
                <Loader2 size={32} style={{ color: '#0877ee', marginBottom: '10px' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>กำลังโหลดรายการโปรโมชัน...</p>
              </div>
            ) : promotionsQuery.isError ? (
              <div className="error" role="alert">
                โหลดรายการโปรโมชันไม่สำเร็จ: {(promotionsQuery.error as Error)?.message}
              </div>
            ) : !promotionsQuery.data || promotionsQuery.data.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '240px', border: '1px dashed #d7e5f6', borderRadius: '10px', background: '#f5f8ff' }}>
                <div className="empty-icon">
                  <Ticket size={32} />
                </div>
                <p style={{ fontSize: '13px' }}>ยังไม่มีรายการโปรโมชัน</p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setActiveTab('create')}
                  style={{ fontSize: '12px', padding: '8px 14px' }}
                >
                  + สร้างโปรโมชันแรก
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
                {promotionsQuery.data.map((promo) => (
                  <article
                    key={promo.id}
                    style={{
                      ...cardStyle,
                      padding: '16px',
                      display: 'grid',
                      gap: '12px',
                      background: promo.active ? '#fff' : '#f5f8ff',
                      opacity: promo.active ? 1 : 0.7,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontSize: '15px', color: '#102f5d', overflowWrap: 'anywhere' }}>{promo.name}</h4>
                          <span className={promo.active ? 'status' : 'status inactive'}>
                            {promo.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </div>

                        {promo.code && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                            <span
                              style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#a36600',
                                background: '#fff5df',
                                border: '1px solid #f5d9a3',
                                padding: '3px 9px',
                                borderRadius: '6px',
                              }}
                            >
                              🎟️ {promo.code}
                            </span>
                            <small style={{ color: '#607a9d', fontSize: '11px' }}>รหัสคูปอง</small>
                          </div>
                        )}
                      </div>

                      {/* Toggle button */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={promo.active}
                        aria-label={`${promo.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${promo.name}`}
                        className={promo.active ? 'toggle on' : 'toggle'}
                        onClick={() =>
                          toggleMutation.mutate({ id: promo.id, active: !promo.active })
                        }
                        title={promo.active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                        style={{ flexShrink: 0 }}
                      >
                        <i />
                      </button>
                    </div>

                    {/* Benefit & Rule */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                      <div style={statBoxStyle}>
                        <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>มูลค่าส่วนลด</small>
                        <strong style={{ display: 'block', color: '#0877ee', fontSize: '15px', marginTop: '3px' }}>
                          {promo.discountType === 'PERCENTAGE'
                            ? `ลด ${promo.discountValue}%`
                            : `ลด ${money.format(promo.discountValue)}`}
                        </strong>
                        {promo.discountType === 'PERCENTAGE' && promo.maxDiscount && (
                          <small style={{ display: 'block', color: '#607a9d', fontSize: '11px', marginTop: '2px' }}>
                            สูงสุด {money.format(promo.maxDiscount)}
                          </small>
                        )}
                      </div>

                      <div style={statBoxStyle}>
                        <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>ยอดซื้อขั้นต่ำ</small>
                        <strong style={{ display: 'block', color: '#163d70', fontSize: '15px', marginTop: '3px' }}>
                          {promo.minSpend > 0 ? money.format(promo.minSpend) : 'ไม่มีขั้นต่ำ'}
                        </strong>
                        <small style={{ display: 'block', color: '#607a9d', fontSize: '11px', marginTop: '2px', overflowWrap: 'anywhere' }}>{promo.branchName}</small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === 'create' ? (
          /* CREATE PROMOTION TAB */
          <section aria-labelledby="promotion-create-title" style={{ maxWidth: '680px', margin: '0 auto', display: 'grid', gap: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 id="promotion-create-title" style={{ fontSize: '16px', margin: '0 0 4px' }}>สร้างโปรโมชันหรือคูปองใหม่</h3>
              <p className="help" style={{ margin: 0 }}>
                กำหนดประเภทส่วนลด ยอดซื้อขั้นต่ำ และรหัสคูปองเพื่อใช้ในหน้าขาย
              </p>
            </div>

            {createError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} style={{ ...cardStyle, display: 'grid', gap: '16px' }}>
              <label style={fieldLabelStyle}>
                ชื่อโปรโมชัน *
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ลด 10% ลูกค้าใหม่, ส่วนลดต้อนรับสงกรานต์"
                  style={fieldInputStyle}
                />
              </label>

              <div>
                <label style={fieldLabelStyle}>
                  รหัสคูปอง (ถ้ามี เช่น RUBTANG50)
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="เว้นว่างไว้หากต้องการให้เป็นโปรโมชันอัตโนมัติ"
                    style={{ ...fieldInputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', textTransform: 'uppercase' }}
                  />
                </label>
                <p className="help" style={{ margin: '4px 0 0', fontSize: '11px' }}>
                  ถ้าใส่รหัส ลูกค้าหรือแคชเชียร์จะต้องกรอกรหัสนี้เพื่อรับส่วนลด
                </p>
              </div>

              {/* Discount Type Toggle */}
              <div role="group" aria-labelledby="promotion-discount-type-label">
                <span id="promotion-discount-type-label" style={{ ...fieldLabelStyle, marginBottom: '6px' }}>
                  ประเภทส่วนลด *
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                  <button
                    type="button"
                    aria-pressed={discountType === 'PERCENTAGE'}
                    onClick={() => setDiscountType('PERCENTAGE')}
                    className={discountType === 'PERCENTAGE' ? 'primary' : 'secondary'}
                    style={{ padding: '10px 12px', fontSize: '13px' }}
                  >
                    <Percent size={16} />
                    เปอร์เซ็นต์ (%)
                  </button>
                  <button
                    type="button"
                    aria-pressed={discountType === 'FIXED_AMOUNT'}
                    onClick={() => setDiscountType('FIXED_AMOUNT')}
                    className={discountType === 'FIXED_AMOUNT' ? 'primary' : 'secondary'}
                    style={{ padding: '10px 12px', fontSize: '13px' }}
                  >
                    <span aria-hidden="true">฿</span>
                    จำนวนเงินคงที่ (บาท)
                  </button>
                </div>
              </div>

              {/* Value and Max Discount */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <label style={fieldLabelStyle}>
                  {discountType === 'PERCENTAGE' ? 'เปอร์เซ็นต์ส่วนลด (%) *' : 'จำนวนเงินส่วนลด (บาท) *'}
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="10"
                    className="numeric"
                    style={fieldInputStyle}
                  />
                </label>

                {discountType === 'PERCENTAGE' && (
                  <label style={fieldLabelStyle}>
                    เพดานส่วนลดสูงสุด (บาท, ถ้ามี)
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(e.target.value)}
                      placeholder="เช่น ลดสูงสุดไม่เกิน 200 บาท"
                      className="numeric"
                      style={fieldInputStyle}
                    />
                  </label>
                )}
              </div>

              {/* Min Spend & Scope */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <label style={fieldLabelStyle}>
                  ยอดซื้อขั้นต่ำ (บาท)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={minSpend}
                    onChange={(e) => setMinSpend(e.target.value)}
                    placeholder="0.00"
                    className="numeric"
                    style={fieldInputStyle}
                  />
                </label>

                <div>
                  <label htmlFor="promotion-target-branch" style={{ ...fieldLabelStyle, marginBottom: '6px' }}>
                    ขอบเขตการใช้งาน
                  </label>
                  <div style={{ display: 'grid' }}>
                  <AppSelect
                    id="promotion-target-branch"
                    icon={<Building2 size={16} />}
                    value={targetBranchId}
                    onChange={(e) => setTargetBranchId(e.target.value)}
                  >
                    <option value="">ทุกสาขา (All Branches)</option>
                    {profile.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        เฉพาะ {b.name}
                      </option>
                    ))}
                  </AppSelect>
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '4px' }}>
                <button
                  type="submit"
                  className="primary"
                  disabled={createMutation.isPending}
                  style={{ width: '100%' }}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 size={16} />
                      กำลังบันทึกโปรโมชัน...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      บันทึกโปรโมชัน
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        ) : (
          /* TEST COUPON TAB */
          <section aria-labelledby="promotion-test-title" style={{ maxWidth: '580px', margin: '0 auto', display: 'grid', gap: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 id="promotion-test-title" style={{ fontSize: '16px', margin: '0 0 4px' }}>ทดสอบคำนวณรหัสคูปอง</h3>
              <p className="help" style={{ margin: 0 }}>
                จำลองยอดซื้อและรหัสคูปองเพื่อตรวจสอบความถูกต้องของเงื่อนไข
              </p>
            </div>

            <form onSubmit={handleTestSubmit} style={{ ...cardStyle, display: 'grid', gap: '16px' }}>
              <div>
                <label htmlFor="promotion-test-code" style={{ ...fieldLabelStyle, marginBottom: '6px' }}>
                  รหัสคูปอง *
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    id="promotion-test-code"
                    type="text"
                    required
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                    placeholder="เช่น RUBTANG50, SALE10"
                    style={{
                      ...fieldInputStyle,
                      marginTop: 0,
                      flex: '1 1 180px',
                      minWidth: 0,
                      width: 'auto',
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                      textTransform: 'uppercase',
                    }}
                  />
                  <button
                    type="submit"
                    className="primary"
                    disabled={validateMutation.isPending}
                    style={{ padding: '10px 16px', whiteSpace: 'nowrap', flex: '0 0 auto' }}
                  >
                    {validateMutation.isPending ? (
                      <Loader2 size={16} />
                    ) : (
                      <Search size={16} />
                    )}
                    ตรวจคูปอง
                  </button>
                </div>
              </div>

              <label style={fieldLabelStyle}>
                ยอดสั่งซื้อจำลอง (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={testSubtotal}
                  onChange={(e) => setTestSubtotal(e.target.value)}
                  className="numeric"
                  style={fieldInputStyle}
                />
              </label>

              {/* Error badge */}
              {testError && (
                <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  {testError}
                </div>
              )}

              {/* Success Result Badge */}
              {testResult && (
                <div
                  role="status"
                  style={{
                    border: '1px solid #bfe6d2',
                    background: '#eefaf3',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'grid',
                    gap: '12px',
                  }}
                >
                  <div className="coupon-result valid" style={{ margin: 0, fontWeight: 700, fontSize: '14px', overflowWrap: 'anywhere' }}>
                    <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                    ใช้คูปองสำเร็จ! {testResult.promotion.name}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      gap: '8px',
                      borderTop: '1px solid #cdeedd',
                      paddingTop: '12px',
                    }}
                  >
                    <div style={{ ...statBoxStyle, background: '#fff' }}>
                      <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>ยอดเดิม</small>
                      <strong className="numeric" style={{ display: 'block', color: '#163d70', marginTop: '3px', textAlign: 'left' }}>{money.format(testResult.subtotal)}</strong>
                    </div>
                    <div style={{ ...statBoxStyle, background: '#fff' }}>
                      <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>ส่วนลดที่ได้</small>
                      <strong className="negative" style={{ display: 'block', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>
                        -{money.format(testResult.discountAmount)}
                      </strong>
                    </div>
                    <div style={{ ...statBoxStyle, background: '#fff' }}>
                      <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>ยอดสุทธิที่ต้องจ่าย</small>
                      <strong className="positive" style={{ display: 'block', marginTop: '3px', fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>
                        {money.format(testResult.finalTotal)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </section>
        )}
      </div>
    </dialog>
  );
}
