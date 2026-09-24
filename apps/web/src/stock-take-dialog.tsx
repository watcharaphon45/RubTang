import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Building2,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import {
  approveStockTake,
  Branch,
  cancelStockTake,
  createStockTake,
  getStockTake,
  listStockTakes,
  Profile,
  StockTakeDetail,
  StockTakeStatus,
  StockTakeSummary,
  updateStockTakeCounts,
} from './api';
import { AppSelect } from './components/app-select';
import { DynamicStatusBadge } from './components/status-badge';

export function StockTakeDialog({
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

  // Active view: list | new | detail
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [selectedStockTakeId, setSelectedStockTakeId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | StockTakeStatus>('ALL');
  const [selectedBranchId, setSelectedBranchId] = useState(branch.id);
  const [notice, setNotice] = useState<string | null>(null);

  // New stock take form
  const [newNote, setNewNote] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // List Query
  const stockTakesQuery = useQuery({
    queryKey: ['stock-takes', selectedBranchId, statusFilter],
    queryFn: () => listStockTakes(
      selectedBranchId,
      statusFilter === 'ALL' ? undefined : statusFilter,
    ),
  });

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (payload: { branchId: string; note?: string }) => createStockTake(payload),
    onSuccess: (data) => {
      setCreateError(null);
      setNewNote('');
      setNotice(`เปิดรอบนับสต็อก ${data.takeNumber} เรียบร้อยแล้ว`);
      queryClient.invalidateQueries({ queryKey: ['stock-takes'] });
      setSelectedStockTakeId(data.id);
      setActiveTab('list');
    },
    onError: (err: any) => {
      setCreateError(err.message || 'เกิดข้อผิดพลาดในการเปิดรอบนับสต็อก');
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      branchId: selectedBranchId,
      note: newNote.trim() || undefined,
    });
  };

  const isOwnerOrManager = profile.role === 'OWNER' || profile.role === 'MANAGER';

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="stock-take-title"
      onCancel={event => { event.preventDefault(); close(); }}
      style={{ width: 'min(1000px, 96vw)', padding: 'clamp(16px, 4vw, 28px)' }}
    >
      {/* Header */}
      <div className="section-heading" style={{ alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#eaf4ff',
              color: '#0877ee',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Package size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span className="eyebrow green">STOCK TAKE</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <h2 id="stock-take-title" style={{ margin: '2px 0 0' }}>ระบบตรวจนับสต็อกสินค้า (Stock Take)</h2>
              <span className="pill">{branch.name}</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
              ตรวจนับสินค้าจริง กระทบยอดส่วนต่าง (Reconciliation) และปรับปรุงสต็อกอัตโนมัติ
            </p>
          </div>
        </div>

        <button type="button" className="icon-button" onClick={close} aria-label="ปิด" style={{ flexShrink: 0 }}>
          <X />
        </button>
      </div>

      {/* Tabs */}
      {!selectedStockTakeId && (
        <div role="tablist" aria-label="มุมมองการตรวจนับ" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 0' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'list'}
            className={activeTab === 'list' ? 'primary' : 'secondary'}
            onClick={() => { setActiveTab('list'); setNotice(null); }}
            style={tabButtonStyle}
          >
            <Clock size={14} />
            รอบการตรวจนับ
          </button>
          {isOwnerOrManager && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'new'}
              className={activeTab === 'new' ? 'primary' : 'secondary'}
              onClick={() => { setActiveTab('new'); setNotice(null); }}
              style={tabButtonStyle}
            >
              <Plus size={14} />
              เปิดรอบตรวจนับใหม่
            </button>
          )}
        </div>
      )}

      {/* Global Notice */}
      {notice && (
        <div
          className="success"
          role="status"
          style={{
            justifyContent: 'space-between',
            padding: '9px 12px',
            borderRadius: '8px',
            background: '#e8f8ef',
            border: '1px solid #bfe8d2',
            color: '#16825d',
            margin: '14px 0 0',
            fontSize: '13px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{notice}</span>
          </span>
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="ปิดข้อความ" style={{ color: '#16825d', padding: '2px' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Body Area */}
      <div style={{ marginTop: '18px' }}>
        {selectedStockTakeId ? (
          <StockTakeDetailView
            stockTakeId={selectedStockTakeId}
            onBack={() => {
              setSelectedStockTakeId(null);
              queryClient.invalidateQueries({ queryKey: ['stock-takes'] });
            }}
            isOwnerOrManager={isOwnerOrManager}
            profile={profile}
          />
        ) : activeTab === 'new' ? (
          <form onSubmit={handleCreateSubmit} style={{ maxWidth: '580px', margin: '0 auto', display: 'grid', gap: '16px' }}>
            <div style={{ ...cardStyle, padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2ecf8', paddingBottom: '12px' }}>
                <div
                  aria-hidden="true"
                  style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eaf4ff', color: '#0877ee', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                >
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>ตั้งค่าเปิดรอบตรวจนับสินค้าใหม่</h3>
                  <p className="help" style={{ margin: '2px 0 0' }}>ระบบจะทำการบันทึก Snapshot ยอดคงเหลือสินค้าปัจจุบันของสาขา</p>
                </div>
              </div>

              {createError && (
                <div role="alert" className="error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '12px' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{createError}</span>
                </div>
              )}

              {/* Branch Selector */}
              <label style={{ margin: '16px 0 0', fontSize: '13px', color: '#163d70' }}>
                สาขาที่ต้องการตรวจนับ
                <div style={{ display: 'grid', marginTop: '7px', fontWeight: 400 }}>
                  <AppSelect
                    icon={<Building2 size={16} />}
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                  >
                    {profile.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </AppSelect>
                </div>
              </label>

              {/* Note input */}
              <label style={{ margin: '14px 0 0', fontSize: '13px', color: '#163d70' }}>
                หมายเหตุ / วัตถุประสงค์การตรวจนับ (ไม่บังคับ)
                <input
                  type="text"
                  placeholder="เช่น ตรวจนับประจำเดือนกันยายน, ตรวจนับหมวดเครื่องดื่ม"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ borderColor: '#cfe0f5' }}
                />
              </label>

              <div style={{ ...warningBoxStyle, marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>คำแนะนำการตรวจนับสต็อก:</span>
                </div>
                <p style={{ margin: '6px 0 0', lineHeight: 1.7 }}>
                  เมื่อเริ่มเปิดรอบนับ ยอดสินค้าในระบบจะถูกตรึงไว้เป็นเกณฑ์เปรียบเทียบ (System Quantity)
                  ท่านสามารถตรวจนับและกรอกจำนวนนับจริงได้ทีละรายการ เมื่อกดยืนยันกระทบยอด ระบบจะปรับปรุงสต็อกให้ตรงกับยอดนับจริงทันที
                </p>
              </div>
            </div>

            <div className="modal-actions" style={{ flexWrap: 'wrap', marginTop: 0 }}>
              <button type="button" className="secondary" onClick={() => setActiveTab('list')}>
                ยกเลิก
              </button>
              <button type="submit" className="primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={16} />
                    กำลังเปิดรอบนับ...
                  </>
                ) : (
                  <>
                    <Package size={16} />
                    เริ่มเปิดรอบตรวจนับสินค้า
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* List of Stock Takes */
          <div style={{ display: 'grid', gap: '14px' }}>
            {/* Filter toolbar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                <Filter size={16} color="#607a9d" aria-hidden="true" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#607a9d' }}>สถานะ:</span>
                {(['ALL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map((st) => {
                  const label =
                    st === 'ALL'
                      ? 'ทั้งหมด'
                      : st === 'IN_PROGRESS'
                      ? 'กำลังตรวจนับ'
                      : st === 'COMPLETED'
                      ? 'ปรับยอดแล้ว'
                      : 'ยกเลิกแล้ว';
                  return (
                    <button
                      key={st}
                      type="button"
                      aria-pressed={statusFilter === st}
                      className={statusFilter === st ? 'primary' : 'secondary'}
                      onClick={() => setStatusFilter(st)}
                      style={tabButtonStyle}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Branch filter if user has multiple branches */}
              {profile.branches.length > 1 && (
                <AppSelect
                  icon={<Building2 size={16} />}
                  aria-label="เลือกสาขา"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                >
                  {profile.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </AppSelect>
              )}
            </div>

            {/* List Table or Empty State */}
            {stockTakesQuery.isLoading ? (
              <div style={loadingStyle}>
                <Loader2 size={30} color="#0877ee" />
                <p style={{ margin: '8px 0 0', fontSize: '12px' }}>กำลังโหลดรายการตรวจนับสต็อก...</p>
              </div>
            ) : stockTakesQuery.data?.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '260px', border: '1px dashed #c9dcf5', borderRadius: '12px', background: '#f5f8ff' }}>
                <div className="empty-icon" style={{ width: '56px', height: '56px', borderRadius: '16px', marginBottom: '14px' }}>
                  <Package size={26} />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: '14px', color: '#163d70' }}>ยังไม่มีประวัติการตรวจนับสต็อก</h4>
                <p style={{ maxWidth: '380px', margin: 0 }}>
                  {statusFilter !== 'ALL'
                    ? 'ไม่พบรายการตามสถานะที่เลือก'
                    : 'เริ่มต้นการนับสต็อกจริงเพื่อตรวจสอบความคลาดเคลื่อนและปรับปรุงยอดคงคลัง'}
                </p>
                {statusFilter === 'ALL' && isOwnerOrManager && (
                  <button type="button" className="primary" onClick={() => setActiveTab('new')} style={{ marginTop: '16px' }}>
                    <Plus size={15} />
                    เปิดรอบตรวจนับสินค้าเดี๋ยวนี้
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {stockTakesQuery.data?.map((st) => (
                  <StockTakeCard
                    key={st.id}
                    take={st}
                    onOpen={() => setSelectedStockTakeId(st.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

const tabButtonStyle: CSSProperties = { fontSize: '12px', padding: '5px 11px', borderRadius: '6px' };

const cardStyle: CSSProperties = {
  border: '1px solid #d7e5f6',
  borderRadius: '10px',
  background: '#fff',
};

const warningBoxStyle: CSSProperties = {
  background: '#fff5df',
  border: '1px solid #f6dca6',
  color: '#a36600',
  borderRadius: '8px',
  padding: '12px',
  fontSize: '12px',
};

const loadingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '56px 16px',
  color: '#607a9d',
  textAlign: 'center',
};

const statLabelStyle: CSSProperties = { fontSize: '11px', color: '#607a9d' };

function signedColor(value: number, zeroColor = '#607a9d') {
  return value > 0 ? '#16825d' : value < 0 ? '#c23f45' : zeroColor;
}

function StockTakeCard({
  take,
  onOpen,
}: {
  take: StockTakeSummary;
  onOpen: () => void;
}) {
  const isCompleted = take.status === 'COMPLETED';
  const isInProgress = take.status === 'IN_PROGRESS';
  const isCancelled = take.status === 'CANCELLED';

  const varianceVal = Number(take.totalVarianceValue);

  return (
    <article
      style={{
        ...cardStyle,
        padding: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        borderLeft: `4px solid ${isInProgress ? '#e67d00' : isCancelled ? '#c23f45' : '#16825d'}`,
      }}
    >
      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'grid', gap: '6px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '14px', color: '#163d70', letterSpacing: '.3px' }}>
            {take.takeNumber}
          </strong>
          <StatusBadge status={take.status} />
          <span className="pill" style={{ padding: '3px 8px' }}>{take.branchName}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: '12px', color: '#607a9d' }}>
          <span>เริ่มโดย: <span style={{ color: '#163d70' }}>{take.createdByName}</span></span>
          <span>เมื่อ: {new Date(take.startedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
          {isCompleted && take.approvedByName && (
            <span>อนุมัติโดย: <span style={{ color: '#16825d', fontWeight: 600 }}>{take.approvedByName}</span></span>
          )}
          {take.note && <span style={{ fontStyle: 'italic' }}>"{take.note}"</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '12px 18px', flex: '1 1 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
          <div>
            <div style={statLabelStyle}>สินค้าทั้งหมด</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#163d70' }}>{take.totalItems} รายการ</div>
          </div>
          <div>
            <div style={statLabelStyle}>ยอดไม่ตรง</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: take.itemsWithVariance > 0 ? '#e67d00' : '#607a9d' }}>
              {take.itemsWithVariance} รายการ
            </div>
          </div>
          <div>
            <div style={statLabelStyle}>มูลค่าส่วนต่าง</div>
            <div className="numeric" style={{ fontSize: '13px', fontWeight: 700, textAlign: 'left', color: signedColor(varianceVal) }}>
              {varianceVal > 0 ? `+฿${varianceVal.toFixed(2)}` : varianceVal < 0 ? `-฿${Math.abs(varianceVal).toFixed(2)}` : '฿0.00'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className={isInProgress ? 'primary' : 'secondary'}
          style={{ padding: '8px 14px', fontSize: '12px', flexShrink: 0 }}
        >
          {isInProgress ? 'บันทึกยอดนับ / ตรวจนับต่อ' : 'ดูรายละเอียด'}
        </button>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: StockTakeStatus }) {
  const badgeStyle: CSSProperties = { alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, borderRadius: '999px', padding: '3px 9px' };
  const fallbackLabel = status === 'IN_PROGRESS' ? 'กำลังตรวจนับ' : status === 'COMPLETED' ? 'ปรับยอดแล้ว' : 'ยกเลิกแล้ว';
  const fallbackColor = status === 'IN_PROGRESS' ? '#a36600' : status === 'COMPLETED' ? '#16825d' : '#c23f45';
  const fallbackBg = status === 'IN_PROGRESS' ? '#fff5df' : status === 'COMPLETED' ? '#eaf8f1' : '#fff1f2';

  return (
    <DynamicStatusBadge
      domain="STOCK_TAKE"
      code={status}
      fallbackLabel={fallbackLabel}
      fallbackColor={fallbackColor}
      fallbackBg={fallbackBg}
      style={badgeStyle}
    />
  );
}

/* =========================================================================
   DETAIL & COUNTING VIEW
   ========================================================================= */

function StockTakeDetailView({
  stockTakeId,
  onBack,
  isOwnerOrManager,
  profile,
}: {
  stockTakeId: string;
  onBack: () => void;
  isOwnerOrManager: boolean;
  profile: Profile;
}) {
  const queryClient = useQueryClient();

  // Load full detail
  const detailQuery = useQuery({
    queryKey: ['stock-take-detail', stockTakeId],
    queryFn: () => getStockTake(stockTakeId),
  });

  // Local state for counts (map of itemId -> countedQuantity)
  const [localCounts, setLocalCounts] = useState<Record<string, string>>({});
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'VARIANCE_ONLY' | 'MATCHED_ONLY'>('ALL');

  // Confirmation modals
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize local counts from query
  useEffect(() => {
    if (detailQuery.data?.items) {
      const counts: Record<string, string> = {};
      const notes: Record<string, string> = {};
      for (const item of detailQuery.data.items) {
        counts[item.id] = item.countedQuantity;
        notes[item.id] = item.note || '';
      }
      setLocalCounts(counts);
      setLocalNotes(notes);
      setIsDirty(false);
    }
  }, [detailQuery.data]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!detailQuery.data) return Promise.resolve(null);
      const updates = detailQuery.data.items.map((item) => ({
        itemId: item.id,
        countedQuantity: localCounts[item.id] ?? item.countedQuantity,
        note: localNotes[item.id] !== undefined ? localNotes[item.id] : (item.note || undefined),
      }));
      return updateStockTakeCounts(stockTakeId, updates);
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['stock-take-detail', stockTakeId] });
      queryClient.invalidateQueries({ queryKey: ['stock-takes'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'บันทึกยอดนับไม่สำเร็จ');
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approveStockTake(stockTakeId),
    onSuccess: (data) => {
      setShowApproveConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['stock-take-detail', stockTakeId] });
      queryClient.invalidateQueries({ queryKey: ['stock-takes'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการอนุมัติรอบนับ');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelStockTake(stockTakeId),
    onSuccess: () => {
      setShowCancelConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['stock-take-detail', stockTakeId] });
      queryClient.invalidateQueries({ queryKey: ['stock-takes'] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'ยกเลิกรอบนับไม่สำเร็จ');
    },
  });

  const data = detailQuery.data;

  // Handle Quick count change
  const handleCountChange = (itemId: string, val: string) => {
    setLocalCounts((prev) => ({ ...prev, [itemId]: val }));
    setIsDirty(true);
  };

  const handleStepCount = (itemId: string, step: number) => {
    const current = Number(localCounts[itemId] ?? '0');
    const next = Math.max(0, current + step);
    handleCountChange(itemId, String(next));
  };

  const handleMatchSystem = (itemId: string, sysQty: string) => {
    handleCountChange(itemId, sysQty);
  };

  const handleNoteChange = (itemId: string, val: string) => {
    setLocalNotes((prev) => ({ ...prev, [itemId]: val }));
    setIsDirty(true);
  };

  // Filter & Search items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((item) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        item.productName.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.barcode && item.barcode.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      const currentCount = Number(localCounts[item.id] ?? item.countedQuantity);
      const sysQty = Number(item.systemQuantity);
      const isVariance = currentCount !== sysQty;

      if (filterMode === 'VARIANCE_ONLY') return isVariance;
      if (filterMode === 'MATCHED_ONLY') return !isVariance;
      return true;
    });
  }, [data?.items, searchTerm, filterMode, localCounts]);

  // Derived metrics from current local state
  const liveStats = useMemo(() => {
    if (!data?.items) return { totalItems: 0, varianceCount: 0, netVarianceValue: 0 };
    let varianceCount = 0;
    let netVarianceValue = 0;

    for (const item of data.items) {
      const count = Number(localCounts[item.id] ?? item.countedQuantity);
      const sys = Number(item.systemQuantity);
      const diff = count - sys;
      if (diff !== 0) {
        varianceCount++;
        netVarianceValue += diff * Number(item.unitPrice);
      }
    }

    return {
      totalItems: data.items.length,
      varianceCount,
      netVarianceValue,
    };
  }, [data?.items, localCounts]);

  if (detailQuery.isLoading) {
    return (
      <div style={loadingStyle}>
        <Loader2 size={30} color="#0877ee" />
        <p style={{ margin: '8px 0 0', fontSize: '12px' }}>กำลังโหลดรายละเอียดรอบตรวจนับ...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state" style={{ minHeight: '200px' }}>
        <p style={{ margin: 0 }}>ไม่พบข้อมูลรอบการตรวจนับนี้</p>
        <button type="button" className="text-button" onClick={onBack} style={{ marginTop: '10px' }}>
          กลับสู่หน้ารายการ
        </button>
      </div>
    );
  }

  const isInProgress = data.status === 'IN_PROGRESS';
  const isCompleted = data.status === 'COMPLETED';

  const thStyle: CSSProperties = { padding: '11px 14px' };
  const tdStyle: CSSProperties = { padding: '12px 14px', verticalAlign: 'middle' };
  const stepButtonStyle: CSSProperties = {
    width: '32px',
    height: '32px',
    padding: 0,
    borderRadius: '7px',
    border: '1px solid #c9dcf5',
    background: '#fff',
    color: '#075dc4',
    fontWeight: 700,
    fontSize: '15px',
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Top Bar with Back Button & Status */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid #e2ecf8', paddingBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <button
            type="button"
            className="secondary"
            onClick={onBack}
            aria-label="กลับสู่หน้ารายการ"
            style={{ padding: '8px', flexShrink: 0 }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '17px', letterSpacing: '.3px' }}>{data.takeNumber}</h3>
              <StatusBadge status={data.status} />
              <span className="pill" style={{ padding: '3px 8px' }}>{data.branchName}</span>
            </div>
            <p className="help" style={{ margin: '3px 0 0' }}>
              สร้างโดย {data.createdByName} เมื่อ {new Date(data.startedAt).toLocaleString('th-TH')}
              {data.note ? ` • หมายเหตุ: ${data.note}` : ''}
            </p>
          </div>
        </div>

        {/* Action Buttons for in-progress session */}
        {isInProgress && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              style={dangerOutlineButtonStyle}
            >
              ยกเลิกรอบนี้
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || saveMutation.isPending}
              style={{ padding: '8px 13px', fontSize: '12px' }}
            >
              {saveMutation.isPending ? (
                <Loader2 size={16} />
              ) : (
                <Save size={16} />
              )}
              {isDirty ? 'บันทึกยอดนับชั่วคราว*' : 'บันทึกยอดแล้ว'}
            </button>
            {isOwnerOrManager && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (isDirty) {
                    saveMutation.mutate(undefined, {
                      onSuccess: () => setShowApproveConfirm(true),
                    });
                  } else {
                    setShowApproveConfirm(true);
                  }
                }}
                style={{ padding: '8px 14px', fontSize: '12px' }}
              >
                <CheckCircle2 size={16} />
                กระทบยอด & ปรับปรุงสต็อก
              </button>
            )}
          </div>
        )}
      </div>

      {/* Completion info banner */}
      {isCompleted && (
        <div
          role="status"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '14px',
            borderRadius: '10px',
            background: '#e8f8ef',
            border: '1px solid #bfe8d2',
            color: '#16825d',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div aria-hidden="true" style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#d2f1e0', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px' }}>รอบนับนี้กระทบยอดและปรับสต็อกสำเร็จแล้ว</div>
              <div style={{ color: '#3f8a6c', marginTop: '2px' }}>
                อนุมัติโดย {data.approvedByName} เมื่อ {data.completedAt ? new Date(data.completedAt).toLocaleString('th-TH') : '-'}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
            <div style={{ fontSize: '11px', color: '#3f8a6c' }}>ผลกระทบมูลค่าสต็อก</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#102f5d' }}>
              {liveStats.netVarianceValue >= 0 ? `+฿${liveStats.netVarianceValue.toFixed(2)}` : `-฿${Math.abs(liveStats.netVarianceValue).toFixed(2)}`}
            </div>
          </div>
        </div>
      )}

      {/* Error alert */}
      {errorMessage && (
        <div role="alert" className="error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </span>
          <button type="button" className="icon-button" onClick={() => setErrorMessage(null)} aria-label="ปิดข้อความผิดพลาด" style={{ color: '#c23f45', padding: '2px' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <div className="metric">
          <small>รายการสินค้าทั้งหมด</small>
          <strong style={{ color: '#102f5d' }}>{liveStats.totalItems} รายการ</strong>
        </div>
        <div className="metric">
          <small>ยอดตรงกัน (Matched)</small>
          <strong style={{ color: '#16825d' }}>
            {liveStats.totalItems - liveStats.varianceCount} รายการ
          </strong>
        </div>
        <div className="metric">
          <small>ยอดคลาดเคลื่อน (Variance)</small>
          <strong style={{ color: liveStats.varianceCount > 0 ? '#e67d00' : '#607a9d' }}>
            {liveStats.varianceCount} รายการ
          </strong>
        </div>
        <div className="metric">
          <small>มูลค่าส่วนต่างสุทธิ</small>
          <strong style={{ color: signedColor(liveStats.netVarianceValue) }}>
            {liveStats.netVarianceValue > 0
              ? `+฿${liveStats.netVarianceValue.toFixed(2)}`
              : liveStats.netVarianceValue < 0
              ? `-฿${Math.abs(liveStats.netVarianceValue).toFixed(2)}`
              : '฿0.00'}
          </strong>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div className="search" style={{ flex: '1 1 240px', width: 'auto', maxWidth: '440px', background: '#fff' }}>
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            placeholder="ค้นหาชื่อสินค้า, SKU, บาร์โค้ด..."
            aria-label="ค้นหาสินค้าในรอบตรวจนับ"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div role="group" aria-label="กรองรายการสินค้า" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          <button
            type="button"
            aria-pressed={filterMode === 'ALL'}
            className={filterMode === 'ALL' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('ALL')}
            style={tabButtonStyle}
          >
            ทั้งหมด ({data.items.length})
          </button>
          <button
            type="button"
            aria-pressed={filterMode === 'VARIANCE_ONLY'}
            className={filterMode === 'VARIANCE_ONLY' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('VARIANCE_ONLY')}
            style={tabButtonStyle}
          >
            เฉพาะยอดไม่ตรง ({liveStats.varianceCount})
          </button>
          <button
            type="button"
            aria-pressed={filterMode === 'MATCHED_ONLY'}
            className={filterMode === 'MATCHED_ONLY' ? 'primary' : 'secondary'}
            onClick={() => setFilterMode('MATCHED_ONLY')}
            style={tabButtonStyle}
          >
            ยอดตรงกัน ({liveStats.totalItems - liveStats.varianceCount})
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="table-scroll" style={{ ...cardStyle, overflowX: 'auto' }}>
        <table style={{ fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={thStyle}>สินค้า</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>ยอดในระบบ</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>ยอดนับจริง (Physical Count)</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>ส่วนต่าง (Variance)</th>
              <th className="numeric" style={thStyle}>มูลค่าส่วนต่าง</th>
              <th style={thStyle}>หมายเหตุ / เหตุผลผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, padding: '40px 14px', textAlign: 'center', color: '#607a9d' }}>
                  ไม่พบรายการสินค้าที่ตรงกับเงื่อนไข
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const countedStr = localCounts[item.id] ?? item.countedQuantity;
                const counted = Number(countedStr);
                const sysQty = Number(item.systemQuantity);
                const variance = counted - sysQty;
                const unitPrice = Number(item.unitPrice);
                const varianceVal = variance * unitPrice;
                const hasDiff = variance !== 0;

                return (
                  <tr key={item.id} style={{ background: hasDiff ? '#fffaf0' : undefined }}>
                    {/* Product Name & SKU */}
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#163d70' }}>{item.productName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#607a9d', marginTop: '2px' }}>
                        <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{item.sku}</span>
                        {item.barcode && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                            <Barcode size={12} aria-hidden="true" />
                            {item.barcode}
                          </span>
                        )}
                        <span>฿{unitPrice.toFixed(2)}/หน่วย</span>
                      </div>
                    </td>

                    {/* System Quantity */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px', fontWeight: 600, color: '#163d70', background: '#eaf4ff', padding: '4px 10px', borderRadius: '7px' }}>
                        {item.systemQuantity}
                      </span>
                    </td>

                    {/* Counted Quantity Input */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {isInProgress ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            aria-label={`ลดจำนวน ${item.productName}`}
                            onClick={() => handleStepCount(item.id, -1)}
                            style={stepButtonStyle}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            aria-label={`ยอดนับจริง ${item.productName}`}
                            value={countedStr}
                            onChange={(e) => handleCountChange(item.id, e.target.value)}
                            style={{
                              width: '70px',
                              padding: '6px 6px',
                              textAlign: 'center',
                              fontFamily: 'ui-monospace, Consolas, monospace',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#102f5d',
                              borderColor: '#9ec7f4',
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`เพิ่มจำนวน ${item.productName}`}
                            onClick={() => handleStepCount(item.id, 1)}
                            style={stepButtonStyle}
                          >
                            +
                          </button>
                          {hasDiff && (
                            <button
                              type="button"
                              className="secondary"
                              title="ตั้งให้เท่ายอดระบบ"
                              onClick={() => handleMatchSystem(item.id, item.systemQuantity)}
                              style={{ height: '32px', padding: '0 8px', fontSize: '11px', borderRadius: '7px' }}
                            >
                              เท่ายอดระบบ
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px', fontWeight: 700, color: '#102f5d' }}>
                          {item.countedQuantity}
                        </span>
                      )}
                    </td>

                    {/* Variance badge */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 9px',
                          borderRadius: '999px',
                          fontFamily: 'ui-monospace, Consolas, monospace',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: variance > 0 ? '#e8f8ef' : variance < 0 ? '#fff1f2' : '#f0f4fa',
                          color: signedColor(variance),
                          border: `1px solid ${variance > 0 ? '#bfe8d2' : variance < 0 ? '#f7c9cc' : '#d7e5f6'}`,
                        }}
                      >
                        {variance > 0 ? `+${variance}` : String(variance)}
                      </span>
                    </td>

                    {/* Variance Value */}
                    <td className="numeric" style={{ ...tdStyle, fontWeight: 600, color: signedColor(varianceVal, '#8297b0') }}>
                      {varianceVal > 0
                        ? `+฿${varianceVal.toFixed(2)}`
                        : varianceVal < 0
                        ? `-฿${Math.abs(varianceVal).toFixed(2)}`
                        : '฿0.00'}
                    </td>

                    {/* Reason / Note input */}
                    <td style={tdStyle}>
                      {isInProgress ? (
                        <input
                          type="text"
                          aria-label={`หมายเหตุ ${item.productName}`}
                          placeholder={hasDiff ? 'ระบุสาเหตุส่วนต่าง (ชำรุด, สูญหาย, ฯลฯ)' : 'หมายเหตุ (ถ้ามี)'}
                          value={localNotes[item.id] ?? ''}
                          onChange={(e) => handleNoteChange(item.id, e.target.value)}
                          style={{ minWidth: '220px', padding: '7px 10px', fontSize: '12px', borderColor: '#cfe0f5' }}
                        />
                      ) : (
                        <span style={{ color: '#607a9d', fontStyle: 'italic' }}>
                          {item.note || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal: Approve & Reconcile */}
      {showApproveConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 50, padding: '16px' }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-take-approve-title" style={{ width: 'min(460px, 100%)', padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '11px', background: '#e8f8ef', color: '#16825d', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h4 id="stock-take-approve-title" style={{ margin: 0, fontSize: '15px', color: '#102f5d' }}>ยืนยันการกระทบยอดและปรับสต็อก</h4>
                <p className="help" style={{ margin: '2px 0 0' }}>รอบนับ {data.takeNumber}</p>
              </div>
            </div>

            <div style={{ marginTop: '16px', padding: '14px', borderRadius: '9px', background: '#f5f8ff', border: '1px solid #d7e5f6', display: 'grid', gap: '8px', fontSize: '12px', color: '#294b76' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <span>รายการสินค้าทั้งหมด:</span>
                <strong style={{ color: '#102f5d' }}>{liveStats.totalItems} รายการ</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <span>สินค้าที่มียอดคลาดเคลื่อน:</span>
                <strong style={{ color: '#e67d00' }}>{liveStats.varianceCount} รายการ</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', borderTop: '1px solid #d7e5f6', paddingTop: '8px' }}>
                <span>มูลค่าสต็อกที่จะปรับปรุงสุทธิ:</span>
                <strong style={{ color: liveStats.netVarianceValue >= 0 ? '#16825d' : '#c23f45' }}>
                  {liveStats.netVarianceValue >= 0 ? `+฿${liveStats.netVarianceValue.toFixed(2)}` : `-฿${Math.abs(liveStats.netVarianceValue).toFixed(2)}`}
                </strong>
              </div>
            </div>

            <p style={{ ...warningBoxStyle, margin: '14px 0 0', lineHeight: 1.7 }}>
              ⚠️ หลังจากกดยืนยัน ระบบจะปรับยอดคงเหลือในคลังของสาขานี้ให้ตรงกับยอดนับจริงทันที
              และบันทึกประวัติความเคลื่อนไหวสต็อก (Stock Movement: ADJUSTMENT) โดยอัตโนมัติ การดำเนินการนี้ไม่สามารถยกเลิกย้อนหลังได้
            </p>

            <div className="modal-actions" style={{ flexWrap: 'wrap', marginTop: '18px' }}>
              <button type="button" className="secondary" onClick={() => setShowApproveConfirm(false)}>
                ย้อนกลับ
              </button>
              <button
                type="button"
                className="primary"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                {approveMutation.isPending ? (
                  <Loader2 size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                ยืนยันการปรับยอดสต็อก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Cancel */}
      {showCancelConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 50, padding: '16px' }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-take-cancel-title" style={{ width: 'min(460px, 100%)', padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '11px', background: '#fff1f2', color: '#c23f45', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <AlertCircle size={22} />
              </div>
              <div>
                <h4 id="stock-take-cancel-title" style={{ margin: 0, fontSize: '15px', color: '#102f5d' }}>ยืนยันการยกเลิกรอบตรวจนับ</h4>
                <p className="help" style={{ margin: '2px 0 0' }}>รอบนับ {data.takeNumber}</p>
              </div>
            </div>

            <p className="muted" style={{ margin: '14px 0 0', fontSize: '13px' }}>
              ท่านต้องการยกเลิกรอบตรวจนับสินค้านี้ใช่หรือไม่? ยอดในคลังสินค้าจะไม่ได้รับการเปลี่ยนแปลงใดๆ
            </p>

            <div className="modal-actions" style={{ flexWrap: 'wrap', marginTop: '18px' }}>
              <button type="button" className="secondary" onClick={() => setShowCancelConfirm(false)}>
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
                style={dangerSolidButtonStyle}
              >
                {cancelMutation.isPending ? (
                  <Loader2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                ยืนยันยกเลิกรอบนับ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const dangerOutlineButtonStyle: CSSProperties = {
  padding: '8px 13px',
  fontSize: '12px',
  fontWeight: 600,
  borderRadius: '8px',
  background: '#fff1f2',
  color: '#c23f45',
  border: '1px solid #f7c9cc',
};

const dangerSolidButtonStyle: CSSProperties = {
  padding: '11px 17px',
  fontWeight: 600,
  borderRadius: '8px',
  background: '#c23f45',
  color: '#fff',
  border: '1px solid #c23f45',
};
