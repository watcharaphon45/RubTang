import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  LayoutGrid,
  Maximize2,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  Users,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Branch,
  DiningTable,
  getTables,
  createTable,
  openTableSession,
  closeTableSession,
  getTableSessionDetails,
  updateTableOrderStatus,
  Profile,
  TableSessionDetail,
} from './api';
import { AppSelect } from './components/app-select';

interface TableDialogProps {
  branch: Branch;
  profile: Profile;
  onClose: () => void;
  onCheckoutTable?: (tableSessionId: string, items: Array<{ productId: string; name: string; sku: string; price: number; quantity: number }>, tableNumber: string) => void;
}

export function TableDialog({ branch, profile, onClose, onCheckoutTable }: TableDialogProps) {
  const queryClient = useQueryClient();
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [guestCount, setGuestCount] = useState<number>(2);
  const [openNote, setOpenNote] = useState<string>('');
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableName, setNewTableName] = useState('');
  const [newTableZone, setNewTableZone] = useState('ห้องแอร์ (Indoor)');
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [activeSessionQr, setActiveSessionQr] = useState<{
    token: string;
    tableNumber: string;
    tableName: string;
    guestCount: number;
    openedAt: string;
    svg: string;
    url: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load tables
  const { data: tables = [], isLoading, refetch } = useQuery({
    queryKey: ['dining-tables', branch.id],
    queryFn: () => getTables(branch.id),
    refetchInterval: 10_000, // Auto-refresh table orders every 10s
  });

  // Load active session detail when a table with active session is selected
  const { data: sessionDetail, isLoading: isLoadingSession, refetch: refetchSession } = useQuery({
    queryKey: ['table-session-detail', selectedTable?.activeSession?.id],
    queryFn: () => getTableSessionDetails(selectedTable!.activeSession!.id),
    enabled: Boolean(selectedTable?.activeSession?.id),
    refetchInterval: 6_000,
  });

  // Extract unique zones
  const zones = useMemo(() => {
    const list = Array.from(new Set(tables.map(t => t.zone || 'ทั่วไป')));
    return list.sort();
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (selectedZone === 'ALL') return tables;
    return tables.filter(t => (t.zone || 'ทั่วไป') === selectedZone);
  }, [tables, selectedZone]);

  // Generate QR SVG whenever activeSessionQr changes
  useEffect(() => {
    if (!activeSessionQr) return;
    const fullUrl = `${window.location.origin}${activeSessionQr.url}`;
    QRCode.toString(fullUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0753bd', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(svg => {
      setActiveSessionQr(prev => prev ? { ...prev, svg } : null);
    });
  }, [activeSessionQr?.url]);

  // Mutations
  const openSessionMutation = useMutation({
    mutationFn: (vars: { tableId: string; guestCount: number; note?: string }) =>
      openTableSession(vars.tableId, { guestCount: vars.guestCount, note: vars.note }),
    onSuccess: async (data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['dining-tables', branch.id] });
      setShowOpenModal(false);
      setOpenNote('');
      // Open Print QR Modal
      setActiveSessionQr({
        token: data.session.sessionToken,
        tableNumber: data.table.number,
        tableName: data.table.name,
        guestCount: vars.guestCount,
        openedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        svg: '',
        url: data.orderUrl,
      });
      // Update selected table
      const updated = tables.find(t => t.id === vars.tableId);
      if (updated) setSelectedTable(updated);
    },
  });

  const createTableMutation = useMutation({
    mutationFn: (input: { branchId: string; number: string; name: string; zone: string; capacity: number }) =>
      createTable(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dining-tables', branch.id] });
      setShowAddTableModal(false);
      setNewTableNumber('');
      setNewTableName('');
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: (vars: { orderId: string; status: 'PENDING' | 'COOKING' | 'SERVED' | 'CANCELLED' }) =>
      updateTableOrderStatus(vars.orderId, vars.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['table-session-detail', selectedTable?.activeSession?.id] });
      await queryClient.invalidateQueries({ queryKey: ['dining-tables', branch.id] });
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => closeTableSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dining-tables', branch.id] });
      setSelectedTable(null);
    },
  });

  const handlePrintSlip = () => {
    window.print();
  };

  const handleCopyLink = () => {
    if (!activeSessionQr) return;
    const fullUrl = `${window.location.origin}${activeSessionQr.url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendToPos = () => {
    if (!sessionDetail || !selectedTable) return;
    const items = sessionDetail.aggregatedItems.map(item => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
    }));
    if (onCheckoutTable) {
      onCheckoutTable(sessionDetail.session.id, items, selectedTable.number);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 40 }}>
      <div
        className="modal table-management-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-dialog-title"
        style={{
          width: 'min(1200px, 96vw)',
          maxHeight: '94vh',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '16px',
        }}
      >
        {/* ─── Top Header ─── */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #d7e5f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0753bd, #0877ee)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(8,119,238,.2)',
              }}
            >
              <QrCode size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="eyebrow green" style={{ fontSize: '11px', letterSpacing: '1px' }}>
                  TABLE & QR ORDERING · {branch.name}
                </span>
                <span className="pill" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  DYNAMIC QR
                </span>
              </div>
              <h2 id="table-dialog-title" style={{ fontSize: '18px', margin: '2px 0 0', color: '#102f5d' }}>
                จัดการโต๊ะ & ออเดอร์ลูกค้า (Self-Ordering)
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => refetch()}
              title="รีเฟรชสถานะโต๊ะ"
              style={{ padding: '8px 12px', fontSize: '12px', gap: '6px' }}
            >
              <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
              <span>รีเฟรช</span>
            </button>
            {profile.role !== 'CASHIER' && (
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddTableModal(true)}
                style={{ padding: '8px 14px', fontSize: '12px', gap: '6px' }}
              >
                <Plus size={15} />
                <span>เพิ่มโต๊ะ</span>
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="ปิด"
              style={{ color: '#607a9d' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ─── Zone Filter Bar ─── */}
        <div
          style={{
            padding: '10px 24px',
            background: '#f8faff',
            borderBottom: '1px solid #e2ecf8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#607a9d', marginRight: '6px' }}>
            โซนที่นั่ง:
          </span>
          <button
            type="button"
            onClick={() => setSelectedZone('ALL')}
            className={selectedZone === 'ALL' ? 'primary' : 'secondary'}
            style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}
          >
            ทั้งหมด ({tables.length})
          </button>
          {zones.map(z => {
            const count = tables.filter(t => (t.zone || 'ทั่วไป') === z).length;
            return (
              <button
                key={z}
                type="button"
                onClick={() => setSelectedZone(z)}
                className={selectedZone === z ? 'primary' : 'secondary'}
                style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}
              >
                {z} ({count})
              </button>
            );
          })}
        </div>

        {/* ─── Main Content Layout (Table Grid + Detail Drawer) ─── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Table Grid View */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              background: '#f5f8ff',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: '16px',
              alignContent: 'start',
            }}
          >
            {filteredTables.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#607a9d',
                }}
              >
                <Utensils size={44} strokeWidth={1.2} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '16px', margin: '0 0 4px', color: '#102f5d' }}>ยังไม่มีโต๊ะในโซนนี้</h3>
                <p style={{ fontSize: '12px', margin: 0 }}>กดปุ่ม &quot;เพิ่มโต๊ะ&quot; ด้านบนเพื่อสร้างโต๊ะแรกของร้าน</p>
              </div>
            ) : (
              filteredTables.map(t => {
                const isOccupied = t.status === 'OCCUPIED' || Boolean(t.activeSession);
                const isSelected = selectedTable?.id === t.id;
                const hasPending = (t.activeSession?.pendingOrdersCount ?? 0) > 0;

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTable(t)}
                    style={{
                      background: '#fff',
                      borderRadius: '14px',
                      border: isSelected
                        ? '2px solid #0877ee'
                        : isOccupied
                        ? '1px solid #bcd8fa'
                        : '1px solid #d7e5f6',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all .2s ease',
                      boxShadow: isSelected
                        ? '0 6px 20px rgba(8,119,238,.16)'
                        : '0 2px 6px rgba(7,83,189,.04)',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '150px',
                    }}
                  >
                    {/* Header Card */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '18px',
                            fontWeight: 800,
                            color: isOccupied ? '#0753bd' : '#102f5d',
                            letterSpacing: '-0.3px',
                          }}
                        >
                          {t.number}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: isOccupied ? '#eaf4ff' : '#e8f8ef',
                            color: isOccupied ? '#0753bd' : '#16825d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: isOccupied ? '#0877ee' : '#16825d',
                            }}
                          />
                          {isOccupied ? 'กำลังทาน' : 'ว่าง'}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#294b76' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#607a9d', marginTop: '2px' }}>
                        {t.zone} · {t.capacity} ที่นั่ง
                      </div>
                    </div>

                    {/* Pending Alert Badge */}
                    {hasPending && (
                      <div
                        style={{
                          background: '#fff7ed',
                          border: '1px solid #ffedd5',
                          color: '#c2410c',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          margin: '8px 0',
                          animation: 'pp-pulse 1.2s infinite',
                        }}
                      >
                        <Flame size={13} color="#ea580c" />
                        <span>มีออเดอร์ใหม่ ({t.activeSession?.pendingOrdersCount})</span>
                      </div>
                    )}

                    {/* Footer Info */}
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f0f4fa' }}>
                      {isOccupied && t.activeSession ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '11px', color: '#607a9d', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Users size={12} /> {t.activeSession.guestCount} ท่าน
                          </span>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0877ee' }}>
                            ฿{t.activeSession.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#16825d', fontWeight: 600 }}>
                            แตะเพื่อเปิดโต๊ะ
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Detail Drawer */}
          {selectedTable && (
            <div
              style={{
                width: '380px',
                background: '#fff',
                borderLeft: '1px solid #d7e5f6',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-4px 0 20px rgba(7,83,189,.04)',
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #e2ecf8',
                  background: '#f8faff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#0753bd' }}>
                      {selectedTable.number}
                    </span>
                    <span
                      className="pill"
                      style={{
                        background: selectedTable.activeSession ? '#eaf4ff' : '#e8f8ef',
                        color: selectedTable.activeSession ? '#0753bd' : '#16825d',
                        fontSize: '11px',
                      }}
                    >
                      {selectedTable.activeSession ? 'กำลังใช้งาน' : 'โต๊ะว่าง'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#607a9d' }}>
                    {selectedTable.name} ({selectedTable.zone})
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelectedTable(null)}
                  style={{ color: '#607a9d' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
                {selectedTable.activeSession ? (
                  <div>
                    {/* Session Quick Bar */}
                    <div
                      style={{
                        background: '#f3f8ff',
                        border: '1px solid #cfe1f7',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', color: '#607a9d' }}>จำนวนลูกค้า</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#102f5d' }}>
                          {selectedTable.activeSession.guestCount} ท่าน
                        </div>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setActiveSessionQr({
                            token: selectedTable.activeSession!.sessionToken,
                            tableNumber: selectedTable.number,
                            tableName: selectedTable.name,
                            guestCount: selectedTable.activeSession!.guestCount,
                            openedAt: new Date(selectedTable.activeSession!.openedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
                            svg: '',
                            url: `/order?token=${selectedTable.activeSession!.sessionToken}`,
                          });
                        }}
                        style={{ padding: '6px 10px', fontSize: '11px', gap: '4px' }}
                      >
                        <QrCode size={13} />
                        <span>ดูสลิป QR</span>
                      </button>
                    </div>

                    {/* Orders List */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#102f5d' }}>
                          รายการอาหารที่สั่ง ({sessionDetail?.orders.length ?? 0} รอบ)
                        </span>
                        <button
                          type="button"
                          className="text-button small"
                          onClick={() => refetchSession()}
                          style={{ fontSize: '11px' }}
                        >
                          อัปเดต
                        </button>
                      </div>

                      {isLoadingSession ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#607a9d', fontSize: '12px' }}>
                          กำลังโหลดรายการออเดอร์…
                        </div>
                      ) : sessionDetail?.orders.length === 0 ? (
                        <div
                          style={{
                            padding: '30px 16px',
                            textAlign: 'center',
                            background: '#f8faff',
                            border: '1px dashed #d7e5f6',
                            borderRadius: '10px',
                            color: '#607a9d',
                            fontSize: '12px',
                          }}
                        >
                          ลูกค้ายังไม่ได้ส่งรายการอาหารเข้ามา
                          <br />
                          <small>สแกน QR บนโต๊ะเพื่อเริ่มสั่ง</small>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {sessionDetail?.orders.map((order, idx) => (
                            <div
                              key={order.id}
                              style={{
                                border: '1px solid #e2ecf8',
                                borderRadius: '10px',
                                padding: '12px',
                                background: order.status === 'PENDING' ? '#fffaf0' : '#fff',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#607a9d' }}>
                                  รอบที่ {idx + 1} · {order.orderNumber}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    background:
                                      order.status === 'PENDING'
                                        ? '#ffedd5'
                                        : order.status === 'COOKING'
                                        ? '#e0f2fe'
                                        : '#e8f8ef',
                                    color:
                                      order.status === 'PENDING'
                                        ? '#c2410c'
                                        : order.status === 'COOKING'
                                        ? '#0369a1'
                                        : '#16825d',
                                  }}
                                >
                                  {order.status === 'PENDING' ? 'รอทำอาหาร' : order.status === 'COOKING' ? 'กำลังทำ' : 'เสิร์ฟแล้ว'}
                                </span>
                              </div>

                              {order.items.map(item => (
                                <div
                                  key={item.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline',
                                    fontSize: '12px',
                                    padding: '3px 0',
                                    borderBottom: '1px dotted #f0f4fa',
                                  }}
                                >
                                  <div>
                                    <span style={{ fontWeight: 600, color: '#102f5d' }}>{item.name}</span>
                                    {item.note && (
                                      <small style={{ display: 'block', color: '#ea580c', fontSize: '10px' }}>
                                        * {item.note}
                                      </small>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                    <span style={{ color: '#607a9d' }}>x{Number(item.quantity)}</span>
                                    <span style={{ fontWeight: 700, color: '#102f5d' }}>
                                      ฿{Number(item.subtotal).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {/* Order Action Buttons */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}>
                                {order.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'COOKING' })}
                                    style={{ padding: '3px 8px', fontSize: '10px' }}
                                  >
                                    รับเข้าครัว
                                  </button>
                                )}
                                {order.status === 'COOKING' && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: 'SERVED' })}
                                    style={{ padding: '3px 8px', fontSize: '10px', color: '#16825d' }}
                                  >
                                    เสิร์ฟแล้ว ✓
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bill Summary */}
                    <div
                      style={{
                        background: '#f8faff',
                        borderRadius: '10px',
                        padding: '14px',
                        border: '1px solid #d7e5f6',
                        marginBottom: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', color: '#607a9d' }}>
                        <span>จำนวนรายการทั้งหมด</span>
                        <span>{sessionDetail?.aggregatedItems.reduce((acc, i) => acc + i.quantity, 0) ?? 0} ชิ้น</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '8px', borderTop: '1px solid #e2ecf8' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#102f5d' }}>ยอดรวมสุทธิ</span>
                        <span style={{ fontSize: '20px', fontWeight: 900, color: '#0877ee' }}>
                          ฿{(sessionDetail?.subtotal ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: '#e8f8ef',
                        color: '#16825d',
                        display: 'grid',
                        placeItems: 'center',
                        margin: '0 auto 16px',
                      }}
                    >
                      <UserCheck size={28} />
                    </div>
                    <h3 style={{ fontSize: '16px', color: '#102f5d', margin: '0 0 6px' }}>โต๊ะนี้ยังว่างอยู่</h3>
                    <p style={{ fontSize: '12px', color: '#607a9d', lineHeight: 1.6, margin: '0 0 20px' }}>
                      เปิดโต๊ะเพื่อให้ระบบสร้าง Dynamic QR สำหรับรอบการทานนี้ พร้อมพิมพ์สลิปให้ลูกค้านำไปสแกนสั่งอาหาร
                    </p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setShowOpenModal(true)}
                      style={{ width: '100%', padding: '12px', fontSize: '13px', gap: '8px' }}
                    >
                      <QrCode size={16} />
                      <span>เปิดโต๊ะ & สร้าง QR สั่งอาหาร</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions (When Occupied) */}
              {selectedTable.activeSession && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderTop: '1px solid #e2ecf8',
                    background: '#fff',
                    display: 'flex',
                    gap: '8px',
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (confirm('คุณต้องการยกเลิกและปิดรอบโต๊ะนี้ใช่หรือไม่?')) {
                        closeSessionMutation.mutate(selectedTable.activeSession!.id);
                      }
                    }}
                    style={{ flex: 1, padding: '10px', fontSize: '12px' }}
                  >
                    ยกเลิกโต๊ะ
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleSendToPos}
                    style={{ flex: 2, padding: '10px', fontSize: '12px', gap: '6px' }}
                  >
                    <Receipt size={16} />
                    <span>เช็คบิล / ส่งเข้า POS</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Modal: Open Table & Generate QR ─── */}
        {showOpenModal && selectedTable && (
          <div className="modal-backdrop" style={{ zIndex: 60 }}>
            <div
              className="modal"
              style={{ width: 'min(440px, 94vw)', padding: '24px', borderRadius: '14px' }}
            >
              <div className="section-heading" style={{ marginBottom: '16px' }}>
                <div>
                  <span className="eyebrow green">OPEN TABLE</span>
                  <h2 style={{ fontSize: '18px', margin: '2px 0 0' }}>
                    เปิดโต๊ะ {selectedTable.number}
                  </h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowOpenModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '6px' }}>
                    จำนวนลูกค้า (ท่าน)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={guestCount}
                    onChange={e => setGuestCount(Number(e.target.value) || 1)}
                    style={{ fontSize: '14px', padding: '10px' }}
                    autoFocus
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '6px' }}>
                    หมายเหตุเพิ่มเติม (ถ้ามี)
                  </span>
                  <input
                    type="text"
                    placeholder="เช่น ขอย้ายโต๊ะ, ขอน้ำแข็งถัง"
                    value={openNote}
                    onChange={e => setOpenNote(e.target.value)}
                    style={{ fontSize: '13px', padding: '10px' }}
                  />
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowOpenModal(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    openSessionMutation.mutate({
                      tableId: selectedTable.id,
                      guestCount,
                      note: openNote,
                    });
                  }}
                  disabled={openSessionMutation.isPending}
                >
                  {openSessionMutation.isPending ? 'กำลังเปิดโต๊ะ…' : 'ยืนยัน & พิมพ์สลิป QR'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Print Dynamic QR Slip ─── */}
        {activeSessionQr && (
          <div className="modal-backdrop" style={{ zIndex: 65 }}>
            <div
              className="modal"
              style={{
                width: 'min(420px, 94vw)',
                padding: '24px',
                borderRadius: '16px',
                background: '#fff',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setActiveSessionQr(null)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Printable Thermal Slip Area */}
              <div
                className="printable-area printable-slip"
                style={{
                  border: '1px dashed #9ec7f4',
                  borderRadius: '12px',
                  padding: '18px 16px',
                  background: '#fbfdff',
                  marginBottom: '16px',
                }}
              >
                <strong style={{ fontSize: '16px', color: '#102f5d', display: 'block' }}>
                  {profile.tenant.name}
                </strong>
                <span style={{ fontSize: '11px', color: '#607a9d', display: 'block', marginTop: '2px' }}>
                  สาขา: {branch.name}
                </span>

                <div
                  style={{
                    margin: '12px 0',
                    padding: '8px 0',
                    borderTop: '1px dashed #cfe1f7',
                    borderBottom: '1px dashed #cfe1f7',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ color: '#607a9d' }}>โต๊ะ: </span>
                    <strong style={{ fontSize: '15px', color: '#0753bd' }}>{activeSessionQr.tableNumber}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#607a9d' }}>ลูกค้า: </span>
                    <strong>{activeSessionQr.guestCount} ท่าน</strong>
                  </div>
                </div>

                {/* QR SVG */}
                <div
                  style={{
                    width: '180px',
                    height: '180px',
                    margin: '10px auto',
                    padding: '8px',
                    background: '#fff',
                    border: '1px solid #e2ecf8',
                    borderRadius: '10px',
                    boxShadow: '0 2px 8px rgba(7,83,189,.06)',
                  }}
                >
                  {activeSessionQr.svg ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: activeSessionQr.svg }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <div style={{ fontSize: '11px', color: '#607a9d', paddingTop: '60px' }}>
                      กำลังสร้าง QR Code…
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#102f5d', marginTop: '6px' }}>
                  สแกนเพื่อสั่งอาหารด้วยมือถือ
                </div>
                <small style={{ color: '#607a9d', fontSize: '10px', display: 'block', marginTop: '4px', lineHeight: 1.4 }}>
                  * QR Code นี้ใช้ได้เฉพาะรอบการทานนี้เท่านั้น
                  <br />
                  เมื่อทานเสร็จ นำสลิปนี้มาชำระเงินที่เคาน์เตอร์
                </small>
                <div style={{ fontSize: '10px', color: '#90a4ae', marginTop: '8px' }}>
                  เวลาเปิดโต๊ะ: {activeSessionQr.openedAt}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gap: '8px' }}>
                <button
                  type="button"
                  className="primary"
                  onClick={handlePrintSlip}
                  style={{ width: '100%', padding: '10px', fontSize: '13px', gap: '6px' }}
                >
                  <Printer size={16} />
                  <span>พิมพ์สลิป QR (Thermal 80mm/58mm)</span>
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleCopyLink}
                    style={{ flex: 1, padding: '9px', fontSize: '12px', gap: '4px' }}
                  >
                    <Copy size={13} />
                    <span>{copiedLink ? 'คัดลอกลิงก์แล้ว!' : 'คัดลอกลิงก์'}</span>
                  </button>
                  <a
                    href={activeSessionQr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary"
                    style={{
                      flex: 1,
                      padding: '9px',
                      fontSize: '12px',
                      gap: '4px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>จำลองสั่งอาหาร</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal: Add New Table ─── */}
        {showAddTableModal && (
          <div className="modal-backdrop" style={{ zIndex: 60 }}>
            <div
              className="modal"
              style={{ width: 'min(440px, 94vw)', padding: '24px', borderRadius: '14px' }}
            >
              <div className="section-heading" style={{ marginBottom: '16px' }}>
                <div>
                  <span className="eyebrow green">NEW TABLE</span>
                  <h2 style={{ fontSize: '18px', margin: '2px 0 0' }}>เพิ่มโต๊ะอาหารใหม่</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowAddTableModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '4px' }}>
                    หมายเลขโต๊ะ (Table Number) *
                  </span>
                  <input
                    type="text"
                    placeholder="เช่น T-07 หรือ A-1"
                    value={newTableNumber}
                    onChange={e => setNewTableNumber(e.target.value)}
                    required
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '4px' }}>
                    ชื่อโต๊ะ / คำอธิบาย *
                  </span>
                  <input
                    type="text"
                    placeholder="เช่น โต๊ะ 7 หรือ โซฟาใหญ่"
                    value={newTableName}
                    onChange={e => setNewTableName(e.target.value)}
                    required
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '4px' }}>
                    โซนที่นั่ง (Zone)
                  </span>
                  <input
                    type="text"
                    placeholder="เช่น ห้องแอร์, ระเบียงสวน, ห้อง VIP"
                    value={newTableZone}
                    onChange={e => setNewTableZone(e.target.value)}
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#102f5d', display: 'block', marginBottom: '4px' }}>
                    จำนวนที่นั่ง (Capacity)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newTableCapacity}
                    onChange={e => setNewTableCapacity(Number(e.target.value) || 4)}
                  />
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAddTableModal(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (!newTableNumber.trim() || !newTableName.trim()) {
                      alert('กรุณากรอกเลขโต๊ะและชื่อโต๊ะ');
                      return;
                    }
                    createTableMutation.mutate({
                      branchId: branch.id,
                      number: newTableNumber,
                      name: newTableName,
                      zone: newTableZone,
                      capacity: newTableCapacity,
                    });
                  }}
                  disabled={createTableMutation.isPending}
                >
                  {createTableMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกโต๊ะ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
