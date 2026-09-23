import { CSSProperties, FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { api, Branch, Product, Profile, StockTransferData } from './api';
import { AppSelect } from './components/app-select';

// Small shared inline styles (palette from styles.css theme)
const chipButton: CSSProperties = { fontSize: '12px', padding: '5px 11px', borderRadius: '6px' };
const fieldLabel: CSSProperties = { display: 'grid', gap: '6px', margin: 0, fontSize: '12px', color: '#163d70' };
const card: CSSProperties = { border: '1px solid #d7e5f6', borderRadius: '10px', padding: '14px', background: '#fff', display: 'grid', gap: '12px' };
const softPanel: CSSProperties = { border: '1px solid #e2ecf8', borderRadius: '10px', padding: '14px', background: '#f5f8ff', display: 'grid', gap: '12px' };
const tableBox: CSSProperties = { border: '1px solid #e2ecf8', borderRadius: '8px', overflow: 'hidden' };
const cellPad: CSSProperties = { padding: '10px 14px' };

export function TransferDialog({
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

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [notice, setNotice] = useState<string | null>(null);

  // Create form state
  const otherBranches = profile.branches.filter((b) => b.id !== branch.id);
  const [originBranchId, setOriginBranchId] = useState(branch.id);
  const [destBranchId, setDestBranchId] = useState(otherBranches[0]?.id ?? '');
  const [transferItems, setTransferItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [note, setNote] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch transfers list
  const transfersQuery = useQuery({
    queryKey: ['transfers', branch.id, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('branchId', branch.id);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      return api<StockTransferData[]>(`/transfers?${params.toString()}`);
    },
  });

  // Fetch products at origin branch for stock availability
  const productsQuery = useQuery({
    queryKey: ['products', profile.tenant.id, originBranchId],
    queryFn: () => api<Product[]>(`/products?branchId=${originBranchId}`),
    enabled: Boolean(originBranchId),
  });

  // Create transfer mutation
  const createMutation = useMutation({
    mutationFn: (payload: {
      originBranchId: string;
      destinationBranchId: string;
      items: { productId: string; quantity: number }[];
      note?: string;
    }) => api<StockTransferData>('/transfers', payload),
    onSuccess: (data) => {
      setCreateError(null);
      setTransferItems([]);
      setNote('');
      setNotice(`สร้างรายการส่งสินค้า ${data.transferNumber} เรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setActiveTab('list');
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'สร้างรายการโอนย้ายไม่สำเร็จ');
    },
  });

  // Receive transfer mutation
  const receiveMutation = useMutation({
    mutationFn: (transferId: string) => api<StockTransferData>(`/transfers/${transferId}/receive`, {}),
    onSuccess: (data) => {
      setNotice(`รับสินค้าเข้าสต็อก ${data.transferNumber} เรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: Error) => {
      setNotice(`เกิดข้อผิดพลาด: ${err.message}`);
    },
  });

  // Cancel transfer mutation
  const cancelMutation = useMutation({
    mutationFn: (transferId: string) => api<StockTransferData>(`/transfers/${transferId}/cancel`, {}),
    onSuccess: (data) => {
      setNotice(`ยกเลิกรายการโอน ${data.transferNumber} และคืนสต็อกเรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: Error) => {
      setNotice(`เกิดข้อผิดพลาด: ${err.message}`);
    },
  });

  // Add product to transfer list
  const handleAddItem = () => {
    if (!selectedProductId) return;
    const existing = transferItems.find((it) => it.productId === selectedProductId);
    if (existing) {
      setTransferItems((prev) =>
        prev.map((it) =>
          it.productId === selectedProductId
            ? { ...it, quantity: it.quantity + selectedQty }
            : it,
        ),
      );
    } else {
      setTransferItems((prev) => [...prev, { productId: selectedProductId, quantity: selectedQty }]);
    }
    setSelectedProductId('');
    setSelectedQty(1);
  };

  const handleRemoveItem = (prodId: string) => {
    setTransferItems((prev) => prev.filter((it) => it.productId !== prodId));
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (originBranchId === destBranchId) {
      setCreateError('สาขาต้นทางและปลายทางต้องไม่เป็นสาขาเดียวกัน');
      return;
    }
    if (transferItems.length === 0) {
      setCreateError('กรุณาเพิ่มสินค้าที่ต้องการโอนย้ายอย่างน้อย 1 รายการ');
      return;
    }
    createMutation.mutate({
      originBranchId,
      destinationBranchId: destBranchId,
      items: transferItems,
      note: note.trim() || undefined,
    });
  };

  const selectedProductObj = productsQuery.data?.find((p) => p.id === selectedProductId);

  const statusBadgeStyle = (status: string): CSSProperties =>
    status === 'IN_TRANSIT'
      ? { background: '#fff5df', color: '#a36600' }
      : status === 'COMPLETED'
      ? { background: '#e8f8ef', color: '#16825d' }
      : { background: '#fff1f2', color: '#c23f45' };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="transfer-dialog-title"
      onCancel={event => { event.preventDefault(); close(); }}
      style={{ width: 'min(1000px, 96vw)', maxHeight: '92vh', padding: 0, overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>
      {/* Header */}
      <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid #e2ecf8', display: 'grid', gap: '12px' }}>
        <div className="section-heading" style={{ alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{ width: '42px', height: '42px', flexShrink: 0, borderRadius: '12px', background: '#eaf4ff', color: '#0877ee', display: 'grid', placeItems: 'center' }}
            >
              <ArrowLeftRight size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow green">STOCK TRANSFER</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <h2 id="transfer-dialog-title" style={{ margin: 0 }}>ระบบโอนย้ายสต็อกระหว่างสาขา</h2>
                <span className="pill">{branch.name}</span>
              </div>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
                ส่งสต็อกข้ามสาขา ตรวจสอบสถานะการขนส่ง และรับเข้าสต็อกปลายทาง
              </p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
            <X />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="เมนูโอนย้ายสต็อก" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'list'}
            onClick={() => { setActiveTab('list'); setNotice(null); }}
            className={activeTab === 'list' ? 'primary' : 'secondary'}
            style={{ ...chipButton, gap: '6px' }}
          >
            <Truck size={14} />
            รายการโอนย้าย
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            onClick={() => { setActiveTab('create'); setNotice(null); }}
            className={activeTab === 'create' ? 'primary' : 'secondary'}
            style={{ ...chipButton, gap: '6px' }}
          >
            <Plus size={14} />
            สร้างรายการโอน
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 22px', background: '#eaf4ff', borderBottom: '1px solid #d7e5f6', color: '#075dc4', fontSize: '13px' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            {notice}
          </span>
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="ปิดข้อความแจ้งเตือน" style={{ color: '#075dc4', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 22px' }}>
        {activeTab === 'list' ? (
          <div style={{ display: 'grid', gap: '14px' }}>
            {/* Filter Toolbar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(['ALL', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={statusFilter === st ? 'primary' : 'secondary'}
                    aria-pressed={statusFilter === st}
                    style={chipButton}
                  >
                    {st === 'ALL'
                      ? 'ทั้งหมด'
                      : st === 'IN_TRANSIT'
                      ? '🚚 กำลังขนส่ง'
                      : st === 'COMPLETED'
                      ? '✅ เสร็จสิ้น'
                      : '❌ ยกเลิก'}
                  </button>
                ))}
              </div>

              <div className="help">แสดงประวัติการโอนย้ายที่เกี่ยวข้องกับสาขานี้</div>
            </div>

            {/* Transfers List */}
            {transfersQuery.isLoading ? (
              <div className="empty-state" style={{ minHeight: '220px' }}>
                <Loader2 size={32} color="#0877ee" style={{ marginBottom: '10px' }} />
                <p style={{ margin: 0 }}>กำลังโหลดรายการโอนย้าย...</p>
              </div>
            ) : transfersQuery.isError ? (
              <div className="error" role="alert">
                โหลดรายการโอนย้ายไม่สำเร็จ: {(transfersQuery.error as Error)?.message}
              </div>
            ) : !transfersQuery.data || transfersQuery.data.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '240px', border: '1px dashed #d7e5f6', borderRadius: '10px', background: '#f5f8ff' }}>
                <div className="empty-icon">
                  <Inbox size={32} />
                </div>
                <p>ยังไม่มีรายการโอนย้ายในสถานะนี้</p>
                <button type="button" className="primary" onClick={() => setActiveTab('create')} style={{ fontSize: '13px', padding: '8px 14px' }}>
                  + สร้างรายการโอนย้ายแรก
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {transfersQuery.data.map((tr) => {
                  const isDestination = tr.destinationBranchId === branch.id;
                  const isOrigin = tr.originBranchId === branch.id;

                  return (
                    <article key={tr.id} style={card}>
                      {/* Top Bar */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', borderBottom: '1px solid #e2ecf8', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontFamily: 'ui-monospace, Consolas, monospace', color: '#163d70', letterSpacing: '.3px' }}>
                            {tr.transferNumber}
                          </strong>
                          <span className="status" style={{ ...statusBadgeStyle(tr.status), fontSize: '11px', fontWeight: 700 }}>
                            {tr.status === 'IN_TRANSIT'
                              ? '🚚 กำลังขนส่ง'
                              : tr.status === 'COMPLETED'
                              ? '✅ เสร็จสิ้น'
                              : '❌ ยกเลิก'}
                          </span>
                        </div>

                        <span className="help" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Clock size={14} />
                          {new Date(tr.createdAt).toLocaleDateString('th-TH')}{' '}
                          {new Date(tr.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Route Display */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '8px',
                            border: `1px solid ${isOrigin ? '#87bfff' : '#e2ecf8'}`,
                            background: isOrigin ? '#eaf4ff' : '#f5f8ff',
                            color: isOrigin ? '#075dc4' : '#36557b',
                            fontWeight: isOrigin ? 600 : 400,
                          }}
                        >
                          <Building2 size={15} color="#607a9d" />
                          <span>ต้นทาง: <strong>{tr.originBranch.name}</strong></span>
                        </div>
                        <ArrowRight size={16} color="#607a9d" aria-hidden="true" />
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '8px',
                            border: `1px solid ${isDestination ? '#9fdcc0' : '#e2ecf8'}`,
                            background: isDestination ? '#e8f8ef' : '#f5f8ff',
                            color: isDestination ? '#16825d' : '#36557b',
                            fontWeight: isDestination ? 600 : 400,
                          }}
                        >
                          <Building2 size={15} color="#607a9d" />
                          <span>ปลายทาง: <strong>{tr.destinationBranch.name}</strong></span>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div className="table-scroll" style={tableBox}>
                        <table style={{ fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th style={cellPad}>รายการสินค้า</th>
                              <th style={cellPad}>รหัส SKU</th>
                              <th className="numeric" style={cellPad}>จำนวนที่โอน</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tr.items.map((it) => (
                              <tr key={it.id}>
                                <td style={{ ...cellPad, fontWeight: 600, color: '#163d70' }}>{it.product.name}</td>
                                <td style={{ ...cellPad, color: '#607a9d', fontFamily: 'ui-monospace, Consolas, monospace' }}>{it.product.sku}</td>
                                <td className="numeric" style={{ ...cellPad, fontWeight: 700, color: '#0877ee' }}>
                                  {Number(it.quantity).toLocaleString('th-TH')} ชิ้น
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer Notes & Actions */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <div className="help" style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
                          <div>ผู้ส่ง: <strong style={{ color: '#163d70' }}>{tr.createdBy?.user?.displayName || 'ไม่ระบุ'}</strong></div>
                          {tr.receivedBy && (
                            <div>ผู้รับ: <strong style={{ color: '#163d70' }}>{tr.receivedBy.user.displayName}</strong> ({new Date(tr.receivedAt!).toLocaleString('th-TH')})</div>
                          )}
                          {tr.notes && <div style={{ overflowWrap: 'anywhere' }}>💬 {tr.notes}</div>}
                        </div>

                        {/* Action buttons if IN_TRANSIT */}
                        {tr.status === 'IN_TRANSIT' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {isDestination && (
                              <button
                                type="button"
                                className="primary"
                                disabled={receiveMutation.isPending}
                                onClick={() => receiveMutation.mutate(tr.id)}
                                style={{ fontSize: '13px', padding: '8px 14px', gap: '6px', background: '#16825d', borderColor: '#16825d', boxShadow: '0 3px 10px #16825d28' }}
                              >
                                {receiveMutation.isPending ? <Loader2 size={14} /> : <PackageCheck size={14} />}
                                รับสินค้าเข้าสต็อก
                              </button>
                            )}

                            {(isOrigin || profile.role === 'OWNER') && (
                              <button
                                type="button"
                                className="secondary"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(tr.id)}
                                style={{ fontSize: '13px', padding: '8px 14px', gap: '6px', color: '#c23f45', borderColor: '#f3c5c8' }}
                              >
                                {cancelMutation.isPending ? <Loader2 size={14} /> : <Ban size={14} />}
                                ยกเลิกการส่ง
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* CREATE TRANSFER TAB */
          <div style={{ maxWidth: '720px', margin: '0 auto', display: 'grid', gap: '14px' }}>
            <div style={{ textAlign: 'center' }}>
              <h3 id="transfer-create-title" style={{ margin: '0 0 4px', fontSize: '16px' }}>สร้างรายการโอนย้ายสินค้าใหม่</h3>
              <p className="help" style={{ margin: 0 }}>
                เลือกสาขาต้นทาง ปลายทาง และสินค้าที่ต้องการส่งออก (ระบบจะตัดสต็อกต้นทางทันที)
              </p>
            </div>

            {createError && (
              <div className="error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} aria-labelledby="transfer-create-title" style={{ ...card, padding: '18px', gap: '16px' }}>
              {/* Branch Selection Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label style={fieldLabel}>
                  สาขาต้นทาง (ตัดสต็อก) *
                  <AppSelect
                    icon={<Building2 size={16} />}
                    value={originBranchId}
                    onChange={(e) => {
                      setOriginBranchId(e.target.value);
                      setTransferItems([]); // Reset items if origin branch changes
                    }}
                  >
                    {profile.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </AppSelect>
                </label>

                <label style={fieldLabel}>
                  สาขาปลายทาง (รับสต็อก) *
                  <AppSelect
                    icon={<Building2 size={16} />}
                    value={destBranchId}
                    onChange={(e) => setDestBranchId(e.target.value)}
                  >
                    {profile.branches
                      .filter((b) => b.id !== originBranchId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </AppSelect>
                </label>
              </div>

              {/* Add Item Subsection */}
              <div style={softPanel}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#163d70' }}>
                  <Package size={16} color="#0877ee" />
                  เลือกสินค้าและจำนวน
                </strong>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                  <label style={{ ...fieldLabel, flex: '3 1 240px', minWidth: 0 }}>
                    เลือกสินค้า
                    <AppSelect value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
                      <option value="">-- กรุณาเลือกสินค้า --</option>
                      {productsQuery.data
                        ?.filter((p) => p.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) - สต็อกต้นทาง: {p.quantity} ชิ้น
                          </option>
                        ))}
                    </AppSelect>
                  </label>

                  <label style={{ ...fieldLabel, flex: '1 1 110px', minWidth: 0 }}>
                    จำนวนที่โอน
                    <input
                      type="number"
                      min="1"
                      max={selectedProductObj ? Number(selectedProductObj.quantity) : 999999}
                      value={selectedQty}
                      onChange={(e) => setSelectedQty(Math.max(1, Number(e.target.value)))}
                      style={{ margin: 0, padding: '10px 11px', borderColor: '#9ec7f4' }}
                    />
                  </label>

                  <button
                    type="button"
                    className="primary"
                    onClick={handleAddItem}
                    disabled={!selectedProductId}
                    style={{ padding: '10px 18px', flex: '1 0 90px', maxWidth: '100%' }}
                  >
                    + เพิ่ม
                  </button>
                </div>

                {selectedProductObj && (
                  <div className="help">
                    สต็อกคงเหลือปัจจุบันที่สาขาต้นทาง:{' '}
                    <strong style={{ color: '#e67d00' }}>{selectedProductObj.quantity} ชิ้น</strong>
                  </div>
                )}
              </div>

              {/* Items Selected Table */}
              <div style={{ display: 'grid', gap: '8px' }}>
                <strong id="transfer-selected-title" style={{ fontSize: '12px', color: '#163d70' }}>
                  รายการสินค้าที่เลือก ({transferItems.length} รายการ)
                </strong>

                {transferItems.length === 0 ? (
                  <div className="help" style={{ border: '1px dashed #d7e5f6', borderRadius: '8px', padding: '20px', textAlign: 'center', background: '#f5f8ff' }}>
                    ยังไม่มีรายการสินค้า กรุณาเลือกสินค้าด้านบนแล้วกด "+ เพิ่ม"
                  </div>
                ) : (
                  <div className="table-scroll" style={tableBox}>
                    <table aria-labelledby="transfer-selected-title" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={cellPad}>สินค้า</th>
                          <th className="numeric" style={cellPad}>จำนวน</th>
                          <th style={{ ...cellPad, textAlign: 'center' }}>ลบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transferItems.map((item) => {
                          const prod = productsQuery.data?.find((p) => p.id === item.productId);
                          return (
                            <tr key={item.productId}>
                              <td style={{ ...cellPad, whiteSpace: 'normal', minWidth: '160px' }}>
                                <div style={{ fontWeight: 600, color: '#163d70' }}>{prod?.name || 'กำลังโหลด...'}</div>
                                <div style={{ fontSize: '11px', color: '#607a9d', fontFamily: 'ui-monospace, Consolas, monospace' }}>{prod?.sku}</div>
                              </td>
                              <td className="numeric" style={{ ...cellPad, fontWeight: 700, color: '#0877ee', fontSize: '14px' }}>
                                {item.quantity.toLocaleString('th-TH')}
                              </td>
                              <td style={{ ...cellPad, textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => handleRemoveItem(item.productId)}
                                  aria-label={`ลบ ${prod?.name ?? 'สินค้า'}`}
                                  style={{ color: '#c23f45' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Note */}
              <label style={fieldLabel}>
                หมายเหตุการส่งสินค้า (ถ้ามี)
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น โอนช่วยสาขาเปิดใหม่, ย้ายสต็อกตามรอบสัปดาห์"
                  style={{ margin: 0, fontWeight: 400, borderColor: '#9ec7f4' }}
                />
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                className="primary"
                disabled={createMutation.isPending || transferItems.length === 0}
                style={{ width: '100%', padding: '12px 16px', gap: '8px', whiteSpace: 'normal', textAlign: 'center' }}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={16} />
                    กำลังส่งคำขอโอนย้าย...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    ยืนยันการส่งสินค้าออก (ตัดสต็อกต้นทางทันที)
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </dialog>
  );
}
