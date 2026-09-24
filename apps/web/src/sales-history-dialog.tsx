import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, Clock, FileText, Loader2, MessageCircle, Printer, RotateCcw, Search, UserRound, X } from 'lucide-react';
import { api, Branch, SaleHistoryItem, sendLineReceipt } from './api';
import { TaxInvoiceDialog } from './tax-invoice-dialog';
import { RefundDialog } from './refund-dialog';
import { DynamicStatusBadge } from './components/status-badge';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

export function SalesHistoryDialog({
  branch,
  role,
  close,
}: {
  branch: Branch;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'VOIDED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Void modal state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sendReceiptMutation = useMutation({
    mutationFn: (saleId: string) => sendLineReceipt(saleId),
    onSuccess: res => {
      setNotice(`ส่ง E-Receipt เลขที่ ${res.receiptNumber} เข้า LINE สำเร็จเรียบร้อย`);
      setTimeout(() => setNotice(null), 3000);
    },
    onError: (err: any) => {
      setNotice(`เกิดข้อผิดพลาด: ${err.message}`);
      setTimeout(() => setNotice(null), 4000);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const salesQuery = useQuery({
    queryKey: ['sales', branch.id],
    queryFn: () => api<SaleHistoryItem[]>(`/sales?branchId=${branch.id}`),
    enabled: Boolean(branch.id),
  });

  const sales = salesQuery.data ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter(s => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (!q) return true;
      const matchReceipt = s.receiptNumber.toLowerCase().includes(q);
      const matchCashier = s.cashierName.toLowerCase().includes(q);
      const matchCustomer = s.customer && (s.customer.name.toLowerCase().includes(q) || s.customer.phone.includes(q));
      return matchReceipt || matchCashier || matchCustomer;
    });
  }, [sales, query, statusFilter]);

  const selected = visible.find(s => s.id === selectedId) ?? visible[0] ?? null;

  const voidMutation = useMutation({
    mutationFn: ({ saleId, reason }: { saleId: string; reason: string }) =>
      api<SaleHistoryItem>(`/sales/${saleId}/void`, { reason }),
    onSuccess: async (voidedSale) => {
      setShowVoidModal(false);
      setVoidReason('');
      setVoidError(null);
      setNotice(`ยกเลิกบิล ${voidedSale.receiptNumber} สำเร็จ คืนสินค้าเข้าสต็อกแล้ว`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['movements'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        setVoidError(err.message);
      } else {
        setVoidError('ไม่สามารถยกเลิกบิลได้ กรุณาลองใหม่อีกครั้ง');
      }
    },
  });

  function handleConfirmVoid(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (voidReason.trim().length < 3) {
      setVoidError('กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร');
      return;
    }
    voidMutation.mutate({ saleId: selected.id, reason: voidReason.trim() });
  }

  const canVoid = (role === 'OWNER' || role === 'MANAGER');

  return (
    <>
      <dialog
        ref={dialog}
        className="modal sales-preview"
        aria-labelledby="sales-history-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow green">SALES & RECEIPTS</span>
            <h2 id="sales-history-title">ประวัติการขายและใบเสร็จ</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="ปิด">
            <X />
          </button>
        </div>
        <p className="muted">
          ตรวจสอบรายการขายย้อนหลังของ {branch.name} พิมพ์ใบเสร็จซ้ำ และจัดการยกเลิกบิล
        </p>

        {notice && (
          <div className="success" style={{ padding: '8px 12px', borderRadius: '6px', background: '#eaf8ef', margin: '8px 0', fontSize: '13px' }}>
            {notice}
          </div>
        )}

        <div className="sales-layout">
          {/* ซ้าย: รายการบิลและการค้นหา */}
          <section>
            <div className="search sales-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาเลขที่บิล, พนักงาน, หรือเบอร์ลูกค้า…"
                aria-label="ค้นหาประวัติการขาย"
              />
              {salesQuery.isFetching && <Loader2 size={16} className="spin" />}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '6px', margin: '10px 0' }}>
              <button
                type="button"
                className={statusFilter === 'ALL' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('ALL')}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
              >
                ทั้งหมด ({sales.length})
              </button>
              <button
                type="button"
                className={statusFilter === 'COMPLETED' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('COMPLETED')}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
              >
                สำเร็จ ({sales.filter(s => s.status === 'COMPLETED').length})
              </button>
              <button
                type="button"
                className={statusFilter === 'VOIDED' ? 'primary' : 'secondary'}
                onClick={() => setStatusFilter('VOIDED')}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
              >
                ยกเลิกบิล ({sales.filter(s => s.status === 'VOIDED').length})
              </button>
            </div>

            <div className="sale-list" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {salesQuery.isLoading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#8297b0' }}>
                  กำลังโหลดข้อมูลการขาย…
                </div>
              ) : visible.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#8297b0' }}>
                  {query ? 'ไม่พบรายการขายที่ตรงกับคำค้นหา' : 'ยังไม่มีประวัติการขายในสาขานี้'}
                </div>
              ) : (
                visible.map((sale) => {
                  const isSelected = selected?.id === sale.id;
                  const isVoided = sale.status === 'VOIDED';

                  return (
                    <button
                      type="button"
                      className={`sale-row ${isSelected ? 'selected' : ''}`}
                      key={sale.id}
                      onClick={() => {
                        setSelectedId(sale.id);
                        setNotice(null);
                      }}
                      style={{
                        opacity: isVoided ? 0.75 : 1,
                        borderLeft: isVoided ? '4px solid #c23f45' : '4px solid #16825d',
                      }}
                    >
                      <FileText size={19} color={isVoided ? '#c23f45' : '#0877ee'} />
                      <span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{sale.receiptNumber}</strong>
                          <DynamicStatusBadge
                            domain="SALE"
                            code={sale.status}
                            fallbackLabel={isVoided ? 'ยกเลิกแล้ว' : 'สำเร็จ'}
                            fallbackColor={isVoided ? '#c23f45' : '#16825d'}
                            fallbackBg={isVoided ? '#fff1f2' : '#eaf8ef'}
                            style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}
                          />
                        </div>
                        <small>
                          {new Date(sale.createdAt).toLocaleString('th-TH')} · {sale.cashierName}
                        </small>
                        {sale.customer && (
                          <small style={{ color: '#075dc4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <UserRound size={11} /> {sale.customer.name} ({sale.customer.phone})
                          </small>
                        )}
                      </span>
                      <strong style={{ textDecoration: isVoided ? 'line-through' : 'none', color: isVoided ? '#8297b0' : undefined }}>
                        {money.format(Number(sale.total))}
                      </strong>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* ขวา: สลิปใบเสร็จเต็มรูปแบบ */}
          <section className="receipt" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {selected ? (
              <div>
                <div className="receipt-heading">
                  <strong style={{ fontSize: '16px', color: '#163d70' }}>RubTang POS</strong>
                  <small style={{ fontWeight: 600 }}>สาขา: {selected.branchName}</small>
                  <small>ใบเสร็จรับเงิน / Receipt</small>
                </div>

                <div className="receipt-meta">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>เลขที่บิล:</span>
                    <strong style={{ color: '#0877ee' }}>{selected.receiptNumber}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>วันที่:</span>
                    <span>{new Date(selected.createdAt).toLocaleString('th-TH')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>แคชเชียร์:</span>
                    <span>{selected.cashierName}</span>
                  </div>
                  {selected.customer && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#075dc4' }}>
                      <span>สมาชิก:</span>
                      <span>{selected.customer.name} ({selected.customer.phone})</span>
                    </div>
                  )}
                </div>

                {/* Void status alert */}
                {selected.status === 'VOIDED' && (
                  <div
                    style={{
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      padding: '10px',
                      marginBottom: '12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: '#9f1239',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                      <AlertTriangle size={15} /> บิลนี้ถูกยกเลิกแล้ว (VOID)
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <strong>เหตุผล:</strong> {selected.voidReason || 'ไม่ได้ระบุ'}
                    </div>
                    {selected.voidedAt && (
                      <div style={{ fontSize: '11px', color: '#be123c', marginTop: '2px' }}>
                        ยกเลิกเมื่อ: {new Date(selected.voidedAt).toLocaleString('th-TH')} {selected.voidedByName && `โดย ${selected.voidedByName}`}
                      </div>
                    )}
                  </div>
                )}

                {/* Items list */}
                <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
                  {selected.items.map((item, idx) => (
                    <div className="receipt-line" key={idx} style={{ fontSize: '13px' }}>
                      <div>
                        <span>{item.name}</span>
                        <div style={{ fontSize: '11px', color: '#8297b0' }}>
                          {item.quantity} × {money.format(Number(item.price))}
                        </div>
                      </div>
                      <strong>{money.format(Number(item.subtotal))}</strong>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="receipt-total">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#607a9d' }}>
                    <span>รวมเป็นเงิน</span>
                    <span>{money.format(Number(selected.subtotal))}</span>
                  </div>
                  {Number(selected.discount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#c23f45' }}>
                      <span>ส่วนลด</span>
                      <span>-{money.format(Number(selected.discount))}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: '#163d70', marginTop: '4px' }}>
                    <span>ยอดสุทธิ</span>
                    <span>{money.format(Number(selected.total))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#607a9d', marginTop: '4px' }}>
                    <span>ชำระด้วย</span>
                    <span>{selected.paymentMethod === 'CASH' ? 'เงินสด (Cash)' : 'โอนเงิน / QR'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: selected.status === 'COMPLETED' && canVoid ? '1fr 1fr' : '1fr 1fr', gap: '8px', marginTop: '14px' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowTaxDialog(true)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Printer size={15} /> พิมพ์ใบเสร็จ
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    onClick={() => sendReceiptMutation.mutate(selected.id)}
                    disabled={sendReceiptMutation.isPending || selected.status === 'VOIDED'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#059669', borderColor: '#a7f3d0' }}
                    title="ส่งใบเสร็จอิเล็กทรอนิกส์เข้า LINE"
                  >
                    <MessageCircle size={15} /> {sendReceiptMutation.isPending ? 'กำลังส่ง...' : 'ส่งเข้า LINE'}
                  </button>

                  {selected.status === 'COMPLETED' && canVoid && (
                    <button
                      type="button"
                      onClick={() => setShowRefundDialog(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: '#fef3c7',
                        color: '#b45309',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '8px',
                      }}
                      title="คืนสินค้าบางส่วน/ทั้งหมด และออกใบลดหนี้"
                    >
                      <RotateCcw size={15} /> คืนสินค้า (Refund)
                    </button>
                  )}

                  {selected.status === 'COMPLETED' && canVoid && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoidReason('');
                        setVoidError(null);
                        setShowVoidModal(true);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: '#fff1f2',
                        color: '#c23f45',
                        border: '1px solid #fecdd3',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '8px',
                      }}
                    >
                      <Ban size={15} /> ยกเลิกบิล (Void)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="receipt-empty">
                <FileText size={32} />
                <p>เลือกรายการเพื่อดูใบเสร็จ</p>
              </div>
            )}
          </section>
        </div>
      </dialog>

      {/* Confirmation Modal สำหรับการยกเลิกบิล (Void) */}
      {showVoidModal && selected && (
        <dialog
          open
          className="modal"
          style={{ width: 'min(450px, 92vw)', zIndex: 1050 }}
          onCancel={() => setShowVoidModal(false)}
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow" style={{ color: '#c23f45' }}>CONFIRM VOID</span>
              <h3 style={{ margin: '4px 0 0', color: '#163d70' }}>ยืนยันยกเลิกบิล {selected.receiptNumber}</h3>
            </div>
            <button className="icon-button" onClick={() => setShowVoidModal(false)} aria-label="ปิด">
              <X />
            </button>
          </div>

          <p className="muted" style={{ fontSize: '13px', margin: '8px 0 14px' }}>
            เมื่อยกเลิกบิลแล้ว ระบบจะ <strong>คืนสินค้าทั้งหมดเข้าสต็อกคงเหลือในสาขา</strong> และ <strong>หักแต้มสะสมของลูกค้าคืน</strong> (หากมี) โดยไม่สามารถย้อนคืนสถานะได้
          </p>

          <form onSubmit={handleConfirmVoid} style={{ display: 'grid', gap: '10px' }}>
            <label style={{ fontSize: '13px', display: 'grid', gap: '4px' }}>
              <strong>ระบุเหตุผลการยกเลิกบิล *</strong>
              <input
                autoFocus
                required
                maxLength={255}
                placeholder="เช่น ลูกค้าขอคืนสินค้า, คีย์รายการผิด, สินค้าชำรุด"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                disabled={voidMutation.isPending}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cfe0f5' }}
              />
            </label>

            {voidError && (
              <div role="alert" className="error" style={{ fontSize: '12px', margin: '4px 0' }}>
                {voidError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowVoidModal(false)}
                disabled={voidMutation.isPending}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={voidMutation.isPending || voidReason.trim().length < 3}
                style={{
                  background: '#c23f45',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {voidMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="spin" /> กำลังยกเลิกบิล…
                  </>
                ) : (
                  <>
                    <Ban size={16} /> ยืนยันการ Void บิล
                  </>
                )}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {showTaxDialog && selected && (
        <TaxInvoiceDialog
          sale={selected}
          branch={branch}
          close={() => setShowTaxDialog(false)}
        />
      )}

      {showRefundDialog && selected && (
        <RefundDialog
          saleId={selected.id}
          receiptNumber={selected.receiptNumber}
          branch={branch}
          role={role}
          close={() => setShowRefundDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sales', branch.id] });
          }}
        />
      )}
    </>
  );
}
