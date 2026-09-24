import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  Loader2,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  api,
  Branch,
  Product,
  Profile,
  PurchaseOrderData,
  PurchaseOrderItemData,
  PurchaseOrderStatus,
  SupplierData,
} from './api';
import { AppSelect } from './components/app-select';
import { DynamicStatusBadge } from './components/status-badge';

const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
});

const statusConfig: Record<
  PurchaseOrderStatus,
  { label: string; bg: string; color: string }
> = {
  DRAFT: { label: 'ร่าง', bg: '#f1f5f9', color: '#475569' },
  ORDERED: { label: 'รอรับสินค้า', bg: '#eff6ff', color: '#1d4ed8' },
  PARTIALLY_RECEIVED: { label: 'รับแล้วบางส่วน', bg: '#fef3c7', color: '#b45309' },
  RECEIVED: { label: 'รับครบแล้ว', bg: '#ecfdf5', color: '#065f46' },
  CANCELLED: { label: 'ยกเลิก', bg: '#fef2f2', color: '#991b1b' },
};

type CreateLineItem = {
  productId: string;
  productName: string;
  sku: string;
  orderedQuantity: string;
  unitCost: string;
};

export function PurchaseOrderDialog({
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
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Detail / Receive Modal state
  const [inspectingPoId, setInspectingPoId] = useState<string | null>(null);
  const [receivingPo, setReceivingPo] = useState<PurchaseOrderData | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({});

  // Create PO Form state
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formBranchId, setFormBranchId] = useState(branch.id);
  const [formNote, setFormNote] = useState('');
  const [lineItems, setLineItems] = useState<CreateLineItem[]>([]);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch Purchase Orders
  const posQuery = useQuery({
    queryKey: ['purchase-orders', formBranchId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api<PurchaseOrderData[]>(`/purchase-orders?${params.toString()}`);
    },
  });

  // Fetch Suppliers for dropdown
  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<SupplierData[]>('/suppliers'),
  });

  // Fetch Products for line items
  const productsQuery = useQuery({
    queryKey: ['products', formBranchId],
    queryFn: () => api<Product[]>(`/products?branchId=${formBranchId}`),
  });

  // Fetch single PO detail when inspecting
  const poDetailQuery = useQuery({
    queryKey: ['purchase-order', inspectingPoId],
    queryFn: () => api<PurchaseOrderData>(`/purchase-orders/${inspectingPoId}`),
    enabled: Boolean(inspectingPoId),
  });

  const activeSuppliers = (suppliersQuery.data ?? []).filter(s => s.active);
  const availableProducts = (productsQuery.data ?? []).filter(p => p.active);

  const createPoMutation = useMutation({
    mutationFn: (payload: any) => api<PurchaseOrderData>('/purchase-orders', payload),
    onSuccess: async newPo => {
      setNotice(`ออกใบสั่งซื้อ ${newPo.poNumber} เรียบร้อยแล้ว`);
      setActiveTab('list');
      setLineItems([]);
      setFormNote('');
      await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({ poId, payload }: { poId: string; payload: any }) =>
      api<any>(`/purchase-orders/${poId}/receive`, payload),
    onSuccess: async res => {
      setNotice(`บันทึกตรวจรับสินค้าเข้าสต็อกสำเร็จ (สถานะ: ${statusConfig[res.status as PurchaseOrderStatus]?.label || res.status})`);
      setReceivingPo(null);
      setReceiveInputs({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['movements'] }),
        queryClient.invalidateQueries({ queryKey: ['purchase-order', inspectingPoId] }),
      ]);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (poId: string) => api<any>(`/purchase-orders/${poId}/cancel`, {}),
    onSuccess: async res => {
      setNotice(`ยกเลิกใบสั่งซื้อ ${res.poNumber} เรียบร้อยแล้ว`);
      await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  function addProductToPo(product: Product) {
    if (lineItems.some(i => i.productId === product.id)) return;
    setLineItems(prev => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        orderedQuantity: '10',
        unitCost: (Number(product.price) * 0.7).toFixed(2), // Estimated 70% wholesale
      },
    ]);
  }

  function updateLineItem(productId: string, field: 'orderedQuantity' | 'unitCost', value: string) {
    setLineItems(prev =>
      prev.map(item => (item.productId === productId ? { ...item, [field]: value } : item)),
    );
  }

  function removeLineItem(productId: string) {
    setLineItems(prev => prev.filter(i => i.productId !== productId));
  }

  const grandTotal = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.orderedQuantity) || 0;
    const cost = parseFloat(item.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  function handleCreatePo(e: FormEvent) {
    e.preventDefault();
    if (!formSupplierId || !formBranchId || lineItems.length === 0) return;

    createPoMutation.mutate({
      supplierId: formSupplierId,
      branchId: formBranchId,
      note: formNote.trim() || undefined,
      items: lineItems.map(i => ({
        productId: i.productId,
        orderedQuantity: String(parseFloat(i.orderedQuantity) || 1),
        unitCost: String(parseFloat(i.unitCost) || 0),
      })),
    });
  }

  function openReceiveModal(po: PurchaseOrderData) {
    setReceivingPo(po);
    const initial: Record<string, string> = {};
    if (po.items) {
      for (const item of po.items) {
        const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
        initial[item.id] = String(remaining);
      }
    }
    setReceiveInputs(initial);
  }

  function submitGoodsReceipt() {
    if (!receivingPo) return;
    const itemsToSubmit = Object.entries(receiveInputs)
      .filter(([_, qty]) => parseFloat(qty) > 0)
      .map(([itemId, qty]) => ({
        purchaseOrderItemId: itemId,
        receiveQuantity: String(parseFloat(qty)),
      }));

    if (itemsToSubmit.length === 0) {
      alert('กรุณากรอกจำนวนสินค้าที่ต้องการตรวจรับอย่างน้อย 1 รายการ');
      return;
    }

    receiveMutation.mutate({
      poId: receivingPo.id,
      payload: { items: itemsToSubmit },
    });
  }

  const canManage = profile.role === 'OWNER' || profile.role === 'MANAGER';

  const orders = (posQuery.data ?? []).filter(po => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      po.poNumber.toLowerCase().includes(term) ||
      po.supplierName.toLowerCase().includes(term) ||
      po.branchName.toLowerCase().includes(term)
    );
  });

  return (
    <dialog
      ref={dialog}
      className="modal purchase-order-dialog"
      aria-labelledby="po-dialog-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
      style={{ maxWidth: '1060px', width: '96vw' }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">PROCUREMENT · จัดซื้อและรับสินค้า</span>
          <h2 id="po-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={22} color="#0877ee" /> ใบสั่งซื้อและรับสินค้าเข้าคลัง (Purchase Orders)
          </h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      <p className="muted" style={{ margin: '-8px 0 16px 0', fontSize: '13px' }}>
        ออกใบสั่งซื้อให้คู่ค้า ติดตามความคืบหน้าการส่งมอบ และตรวจรับสินค้าเข้าสต็อกสาขาอัตโนมัติ
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => {
            setActiveTab('list');
            setNotice(null);
          }}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'list' ? '2px solid #0877ee' : '2px solid transparent',
            color: activeTab === 'list' ? '#0877ee' : '#64748b',
          }}
        >
          รายการใบสั่งซื้อ ({posQuery.data?.length ?? 0})
        </button>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setNotice(null);
              if (activeSuppliers.length > 0 && !formSupplierId) {
                setFormSupplierId(activeSuppliers[0].id);
              }
            }}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'create' ? '2px solid #0877ee' : '2px solid transparent',
              color: activeTab === 'create' ? '#0877ee' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={15} /> ออกใบสั่งซื้อใหม่
          </button>
        )}
      </div>

      {notice && (
        <div
          style={{
            padding: '10px 14px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '8px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <Check size={16} /> {notice}
        </div>
      )}

      {(createPoMutation.isError || receiveMutation.isError || cancelMutation.isError) && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '8px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <AlertTriangle size={16} />
          {(createPoMutation.error as any)?.message ||
            (receiveMutation.error as any)?.message ||
            (cancelMutation.error as any)?.message ||
            'เกิดข้อผิดพลาดในการดำเนินการ'}
        </div>
      )}

      {activeTab === 'list' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['ALL', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const).map(st => (
                <button
                  type="button"
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={statusFilter === st ? 'primary' : 'secondary'}
                  style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px' }}
                >
                  {st === 'ALL' ? 'ทั้งหมด' : statusConfig[st]?.label}
                </button>
              ))}
            </div>

            <div className="search" style={{ minWidth: '240px' }}>
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาเลขที่ PO, คู่ค้า..."
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {/* PO List */}
          {posQuery.isLoading ? (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>กำลังโหลดรายการใบสั่งซื้อ...</p>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 10px', color: '#94a3b8' }}>
              <ClipboardList size={44} strokeWidth={1.5} style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ margin: 0 }}>{search ? 'ไม่พบใบสั่งซื้อที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติใบสั่งซื้อในระบบ'}</p>
              {canManage && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setActiveTab('create')}
                  style={{ marginTop: '10px', fontSize: '12px' }}
                >
                  สร้างใบสั่งซื้อแรก
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '460px', overflowY: 'auto' }}>
              {orders.map(po => {
                const conf = statusConfig[po.status] || { label: po.status, bg: '#eee', color: '#333' };
                const percent =
                  po.totalOrderedQty > 0
                    ? Math.round((po.totalReceivedQty / po.totalOrderedQty) * 100)
                    : 0;

                return (
                  <div
                    key={po.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div style={{ flex: '1.2 1 220px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{po.poNumber}</strong>
                        <DynamicStatusBadge
                          domain="PURCHASE_ORDER"
                          code={po.status}
                          fallbackLabel={conf.label}
                          fallbackBg={conf.bg}
                          fallbackColor={conf.color}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569' }}>
                        คู่ค้า: <strong>{po.supplierName}</strong> · ส่งที่: <strong>{po.branchName}</strong>
                      </div>
                      <small style={{ color: '#94a3b8', fontSize: '11px' }}>
                        สร้างโดย: {po.createdByName} · {new Date(po.createdAt).toLocaleDateString('th-TH')}
                      </small>
                    </div>

                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: '#64748b' }}>รับสินค้าแล้ว:</span>
                        <strong>
                          {po.totalReceivedQty} / {po.totalOrderedQty} ชิ้น ({percent}%)
                        </strong>
                      </div>
                      <div style={{ height: '6px', width: '100%', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${percent}%`,
                            background: percent >= 100 ? '#10b981' : percent > 0 ? '#f59e0b' : '#cbd5e1',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                      <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '13px', fontWeight: 700, color: '#0877ee' }}>
                        {money.format(po.totalAmount)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setInspectingPoId(po.id)}
                        style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={14} /> รายละเอียด
                      </button>

                      {canManage && (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && (
                        <button
                          type="button"
                          className="primary"
                          onClick={async () => {
                            try {
                              const detailed = await api<PurchaseOrderData>(`/purchase-orders/${po.id}`);
                              openReceiveModal(detailed);
                            } catch {
                              openReceiveModal(po);
                            }
                          }}
                          style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <PackagePlus size={14} /> ตรวจรับสินค้า
                        </button>
                      )}

                      {canManage && po.status === 'ORDERED' && po.totalReceivedQty === 0 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            if (confirm(`คุณต้องการยกเลิกใบสั่งซื้อ ${po.poNumber} หรือไม่?`)) {
                              cancelMutation.mutate(po.id);
                            }
                          }}
                          style={{ padding: '6px 8px', fontSize: '12px', color: '#dc2626' }}
                          title="ยกเลิกใบสั่งซื้อ"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <form onSubmit={handleCreatePo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                เลือกผู้จำหน่าย / ซัพพลายเออร์ <span style={{ color: '#dc2626' }}>*</span>
              </label>
              {activeSuppliers.length === 0 ? (
                <p style={{ color: '#dc2626', fontSize: '12px', margin: 0 }}>
                  ยังไม่มีผู้จำหน่ายที่เปิดใช้งาน กรุณาไปที่เมนู "ผู้จำหน่าย" เพื่อเพิ่มคู่ค้าก่อน
                </p>
              ) : (
                <AppSelect
                  icon={<Building size={16} />}
                  value={formSupplierId}
                  onChange={e => setFormSupplierId(e.target.value)}
                >
                  <option value="" disabled>-- เลือกผู้จำหน่าย --</option>
                  {activeSuppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.creditDays > 0 ? `(เครดิต ${s.creditDays} วัน)` : '(เงินสด)'}
                    </option>
                  ))}
                </AppSelect>
              )}
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                สาขาปลายทางที่รับสินค้าเข้า <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <AppSelect
                icon={<Package size={16} />}
                value={formBranchId}
                onChange={e => {
                  setFormBranchId(e.target.value);
                  setLineItems([]);
                }}
              >
                {profile.branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </AppSelect>
            </div>
          </div>

          {/* Add product section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                รายการสินค้าในใบสั่งซื้อ ({lineItems.length} รายการ)
              </label>
            </div>

            {/* Quick add product picker */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select
                id="product-picker"
                style={{ flex: 1, padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                defaultValue=""
                onChange={e => {
                  const p = availableProducts.find(prod => prod.id === e.target.value);
                  if (p) {
                    addProductToPo(p);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>+ เลือกสินค้าเพื่อเพิ่มลงใบสั่งซื้อ...</option>
                {availableProducts.map(p => (
                  <option key={p.id} value={p.id} disabled={lineItems.some(i => i.productId === p.id)}>
                    {p.name} ({p.sku}) · ราคาขาย {money.format(Number(p.price))}
                  </option>
                ))}
              </select>
            </div>

            {/* Line items table */}
            {lineItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '13px' }}>ยังไม่ได้เลือกสินค้า กรุณาเลือกสินค้าจากดรอปดาวน์ด้านบน</p>
              </div>
            ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>สินค้า</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: '130px' }}>จำนวนสั่ง</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: '140px' }}>ต้นทุน/หน่วย (บาท)</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: '130px' }}>รวม (บาท)</th>
                      <th style={{ width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(item => {
                      const qty = parseFloat(item.orderedQuantity) || 0;
                      const cost = parseFloat(item.unitCost) || 0;
                      return (
                        <tr key={item.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong style={{ display: 'block', color: '#1e293b' }}>{item.productName}</strong>
                            <small style={{ color: '#64748b' }}>{item.sku}</small>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              required
                              value={item.orderedQuantity}
                              onChange={e => updateLineItem(item.productId, 'orderedQuantity', e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={item.unitCost}
                              onChange={e => updateLineItem(item.productId, 'unitCost', e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                            {money.format(qty * cost)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeLineItem(item.productId)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0 }}
                            >
                              <Trash2 size={15} />
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

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
              หมายเหตุ / ข้อมูลเพิ่มเติม
            </label>
            <input
              type="text"
              maxLength={255}
              placeholder="เช่น สั่งด่วนส่งก่อนเที่ยง, โปรดโทรแจ้งก่อนส่ง"
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '4px' }}>
            <div>
              <span style={{ fontSize: '13px', color: '#64748b' }}>ยอดรวมต้นทุนทั้งสิ้น: </span>
              <strong style={{ fontSize: '18px', color: '#0877ee' }}>{money.format(grandTotal)}</strong>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setActiveTab('list')}
                style={{ fontSize: '13px' }}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={createPoMutation.isPending || !formSupplierId || lineItems.length === 0}
                style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {createPoMutation.isPending ? <Loader2 size={14} className="spinning" /> : <PackageCheck size={14} />}
                ออกใบสั่งซื้อ (Create PO)
              </button>
            </div>
          </div>
        </form>
      )}

      {/* DETAIL MODAL */}
      {inspectingPoId && poDetailQuery.data && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '90vw',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  ใบสั่งซื้อ {poDetailQuery.data.poNumber}
                </h3>
                <DynamicStatusBadge
                  domain="PURCHASE_ORDER"
                  code={poDetailQuery.data.status}
                  fallbackLabel={statusConfig[poDetailQuery.data.status]?.label}
                  fallbackBg={statusConfig[poDetailQuery.data.status]?.bg}
                  fallbackColor={statusConfig[poDetailQuery.data.status]?.color}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    marginTop: '4px',
                  }}
                />
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setInspectingPoId(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginBottom: '16px' }}>
              <div>คู่ค้า: <strong>{poDetailQuery.data.supplierName}</strong></div>
              <div>ส่งที่: <strong>{poDetailQuery.data.branchName}</strong></div>
              <div>ผู้ออก PO: <strong>{poDetailQuery.data.createdByName}</strong></div>
              <div>วันที่ออก: <strong>{new Date(poDetailQuery.data.createdAt).toLocaleString('th-TH')}</strong></div>
              {poDetailQuery.data.receivedByName && (
                <div>ผู้ตรวจรับ: <strong>{poDetailQuery.data.receivedByName}</strong></div>
              )}
              {poDetailQuery.data.note && (
                <div style={{ gridColumn: '1 / -1', color: '#64748b' }}>
                  หมายเหตุ: {poDetailQuery.data.note}
                </div>
              )}
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px' }}>สินค้า</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>สั่ง</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>รับแล้ว</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>ต้นทุน</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {poDetailQuery.data.items?.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <strong>{item.productName}</strong>
                        <small style={{ display: 'block', color: '#64748b' }}>{item.sku}</small>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{item.orderedQuantity}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: item.receivedQuantity >= item.orderedQuantity ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                        {item.receivedQuantity}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{money.format(item.unitCost)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{money.format(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '15px', color: '#0877ee' }}>
                มูลค่ารวม: {money.format(poDetailQuery.data.totalAmount)}
              </strong>
              <button
                type="button"
                className="secondary"
                onClick={() => setInspectingPoId(null)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOODS RECEIPT MODAL */}
      {receivingPo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '90vw',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              <div>
                <span className="eyebrow green">GOODS RECEIPT · ตรวจรับสินค้าเข้าสต็อก</span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '17px', color: '#0f172a' }}>
                  ตรวจรับสินค้า: {receivingPo.poNumber}
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setReceivingPo(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px 0' }}>
              ระบุจำนวนสินค้าที่ส่งมอบจริงในแต่ละรายการ ระบบจะบวกจำนวนเข้าสต็อกสาขา "{receivingPo.branchName}" และบันทึกประวัติการรับเข้าทันที
            </p>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px' }}>สินค้า</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>สั่งทั้งหมด</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>รับแล้ว</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px' }}>ค้างรับ</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', width: '130px' }}>รับเข้าครั้งนี้</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingPo.items?.map(item => {
                    const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
                    const currentVal = receiveInputs[item.id] ?? '';

                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <strong style={{ display: 'block', color: '#1e293b' }}>{item.productName}</strong>
                          <small style={{ color: '#64748b' }}>{item.sku}</small>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{item.orderedQuantity}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>
                          {item.receivedQuantity}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: remaining > 0 ? '#b45309' : '#10b981' }}>
                          {remaining}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            step="any"
                            disabled={remaining <= 0}
                            value={currentVal}
                            onChange={e =>
                              setReceiveInputs(prev => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            style={{
                              width: '100%',
                              padding: '4px 8px',
                              fontSize: '12px',
                              textAlign: 'right',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              background: remaining <= 0 ? '#f1f5f9' : '#ffffff',
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setReceivingPo(null)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="primary"
                onClick={submitGoodsReceipt}
                disabled={receiveMutation.isPending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {receiveMutation.isPending ? <Loader2 size={14} className="spinning" /> : <PackageCheck size={14} />}
                ยืนยันรับเข้าสต็อก
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
