import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Key,
  Link2,
  MessageCircle,
  MoreVertical,
  Package,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Shield,
  Smartphone,
  TrendingDown,
  Unlink,
  User,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  Customer,
  getLineLowStockPreview,
  getLineReceiptLogs,
  getLineSettings,
  linkCustomerLine,
  Profile,
  SaleHistoryItem,
  sendLineLowStockAlert,
  sendLineReceipt,
  testLineConnection,
  unlinkCustomerLine,
  updateLineSettings,
} from './api';
import { api } from './api';

export function LineDialog({
  profile,
  close,
}: {
  profile: Profile;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'simulator' | 'stock-alert' | 'settings' | 'customers' | 'logs'>('simulator');

  // Settings form state
  const [accountName, setAccountName] = useState('');
  const [basicId, setBasicId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [channelAccessToken, setChannelAccessToken] = useState('');
  const [autoSendReceipt, setAutoSendReceipt] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [lowStockAlertEnabled, setLowStockAlertEnabled] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [lowStockTargetUserId, setLowStockTargetUserId] = useState('');
  const [stockAlertSuccessMessage, setStockAlertSuccessMessage] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string; botName?: string } | null>(null);
  const [savedNotice, setSavedNotice] = useState('');

  // Simulator state
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [simulatorLineUserId, setSimulatorLineUserId] = useState('U_demo_somchai');
  const [sendSuccessMessage, setSendSuccessMessage] = useState('');

  // Customer link state
  const [linkingCustomer, setLinkingCustomer] = useState<Customer | null>(null);
  const [inputLineUserId, setInputLineUserId] = useState('');
  const [inputLineDisplayName, setInputLineDisplayName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch LINE settings
  const settingsQuery = useQuery({
    queryKey: ['line-settings'],
    queryFn: () => getLineSettings(),
  });

  // Populate settings form when data arrives
  useEffect(() => {
    if (settingsQuery.data) {
      setAccountName(settingsQuery.data.accountName || '');
      setBasicId(settingsQuery.data.basicId || '');
      setChannelId(settingsQuery.data.channelId || '');
      setChannelSecret(settingsQuery.data.channelSecret || '');
      setChannelAccessToken(settingsQuery.data.channelAccessToken || '');
      setAutoSendReceipt(settingsQuery.data.autoSendReceipt ?? true);
      setWelcomeMessage(settingsQuery.data.welcomeMessage || '');
      setLowStockAlertEnabled(settingsQuery.data.lowStockAlertEnabled ?? true);
      setLowStockThreshold(settingsQuery.data.lowStockThreshold ?? 5);
      setLowStockTargetUserId(settingsQuery.data.lowStockTargetUserId || '');
    }
  }, [settingsQuery.data]);

  // Fetch sales history for simulator and sending
  const salesQuery = useQuery({
    queryKey: ['sales', profile.branches[0]?.id],
    queryFn: () => api<SaleHistoryItem[]>(`/sales?branchId=${profile.branches[0]?.id || ''}`),
  });

  // Fetch customers
  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: () => api<Customer[]>('/customers'),
  });

  // Fetch logs
  const logsQuery = useQuery({
    queryKey: ['line-receipt-logs'],
    queryFn: () => getLineReceiptLogs({ limit: 50 }),
  });

  // Default selected sale for simulator
  useEffect(() => {
    if (salesQuery.data && salesQuery.data.length > 0 && !selectedSaleId) {
      setSelectedSaleId(salesQuery.data[0].id);
    }
  }, [salesQuery.data, selectedSaleId]);

  const currentSale = useMemo(() => {
    return salesQuery.data?.find(s => s.id === selectedSaleId) || salesQuery.data?.[0];
  }, [salesQuery.data, selectedSaleId]);

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: updateLineSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['line-settings'] });
      setSavedNotice('บันทึกการตั้งค่า LINE Official Account สำเร็จ');
      setTimeout(() => setSavedNotice(''), 3000);
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: testLineConnection,
    onSuccess: res => {
      setTestResult(res);
    },
    onError: err => {
      setTestResult({ connected: false, message: err.message });
    },
  });

  const sendReceiptMutation = useMutation({
    mutationFn: ({ saleId, lineUserId }: { saleId: string; lineUserId?: string }) =>
      sendLineReceipt(saleId, { lineUserId }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['line-receipt-logs'] });
      setSendSuccessMessage(`ส่ง E-Receipt เลขที่ ${res.receiptNumber} เข้า LINE สำเร็จเรียบร้อย`);
      setTimeout(() => setSendSuccessMessage(''), 4000);
    },
  });

  const linkCustomerMutation = useMutation({
    mutationFn: ({ customerId, payload }: { customerId: string; payload: any }) =>
      linkCustomerLine(customerId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setLinkingCustomer(null);
      setInputLineUserId('');
      setInputLineDisplayName('');
    },
  });

  const unlinkCustomerMutation = useMutation({
    mutationFn: (customerId: string) => unlinkCustomerLine(customerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const lowStockPreviewQuery = useQuery({
    queryKey: ['line-low-stock-preview', profile.branches[0]?.id, lowStockThreshold],
    queryFn: () => getLineLowStockPreview(profile.branches[0]?.id, lowStockThreshold),
    enabled: activeTab === 'stock-alert',
  });

  const sendLowStockMutation = useMutation({
    mutationFn: sendLineLowStockAlert,
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['line-low-stock-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['line-settings'] });
      setStockAlertSuccessMessage(
        res.count > 0
          ? `ส่งแจ้งเตือนสินค้าใกล้หมด ${res.count} รายการ ไปยัง LINE สำเร็จ (${res.targetUserId || 'Official'})`
          : (res.message || 'ไม่มีสินค้าที่สต็อกต่ำกว่าเกณฑ์')
      );
      setTimeout(() => setStockAlertSuccessMessage(''), 5000);
    },
  });

  const handleSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate({
      accountName,
      basicId: basicId || null,
      channelId: channelId || null,
      channelSecret: channelSecret || null,
      channelAccessToken: channelAccessToken || null,
      autoSendReceipt,
      welcomeMessage: welcomeMessage || null,
      lowStockAlertEnabled,
      lowStockThreshold: Number(lowStockThreshold) || 5,
      lowStockTargetUserId: lowStockTargetUserId.trim() || null,
    });
  };

  const filteredCustomers = useMemo(() => {
    const list = customersQuery.data || [];
    if (!customerSearch.trim()) return list;
    const term = customerSearch.toLowerCase();
    return list.filter(
      c =>
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.lineDisplayName && c.lineDisplayName.toLowerCase().includes(term)) ||
        (c.lineUserId && c.lineUserId.toLowerCase().includes(term))
    );
  }, [customersQuery.data, customerSearch]);

  const isConfigured = settingsQuery.data?.isConfigured;

  return (
    <dialog
      ref={dialog}
      className="modal line-dialog"
      style={{
        width: 'min(1150px, 98vw)',
        maxHeight: '94vh',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
      }}
      onCancel={e => {
        e.preventDefault();
        close();
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#06C755',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(6, 199, 85, 0.4)',
            }}
          >
            <MessageCircle size={26} fill="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                LINE Official Account & E-Receipt
              </h2>
              <span
                style={{
                  fontSize: '0.725rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isConfigured ? 'rgba(255,255,255,0.2)' : 'rgba(239, 68, 68, 0.3)',
                  color: '#ffffff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isConfigured ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {isConfigured ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#d1fae5' }}>
              ส่งใบเสร็จรับเงินอิเล็กทรอนิกส์ (Flex Message) ตรงเข้า LINE ลูกค้าอัตโนมัติพร้อมระบบสมาชิกสะสมแต้ม
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => testConnectionMutation.mutate()}
            disabled={testConnectionMutation.isPending}
            style={{
              padding: '7px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.15)',
              borderColor: 'rgba(255,255,255,0.3)',
              color: '#ffffff',
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: testConnectionMutation.isPending ? 'spin 1s linear infinite' : 'none',
              }}
            />
            ทดสอบการเชื่อมต่อ
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="ปิด"
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Test Connection Banner if clicked */}
      {testResult && (
        <div
          style={{
            padding: '10px 24px',
            background: testResult.connected ? '#ecfdf5' : '#fef2f2',
            borderBottom: `1px solid ${testResult.connected ? '#a7f3d0' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            color: testResult.connected ? '#065f46' : '#991b1b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {testResult.connected ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <strong>{testResult.connected ? 'การเชื่อมต่อสมบูรณ์:' : 'การเชื่อมต่อล้มเหลว:'}</strong>
            <span>{testResult.message}</span>
            {testResult.botName && <span style={{ opacity: 0.8 }}>({testResult.botName})</span>}
          </div>
          <button
            type="button"
            onClick={() => setTestResult(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div
        style={{
          display: 'flex',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          style={{
            padding: '14px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'simulator' ? '3px solid #06C755' : '3px solid transparent',
            color: activeTab === 'simulator' ? '#047857' : '#64748b',
            fontWeight: activeTab === 'simulator' ? 700 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Smartphone size={18} color={activeTab === 'simulator' ? '#06C755' : '#64748b'} />
          จำลองหน้าจอมือถือ (Smartphone Simulator)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock-alert')}
          style={{
            padding: '14px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'stock-alert' ? '3px solid #dc2626' : '3px solid transparent',
            color: activeTab === 'stock-alert' ? '#b91c1c' : '#64748b',
            fontWeight: activeTab === 'stock-alert' ? 700 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Bell size={18} color={activeTab === 'stock-alert' ? '#dc2626' : '#64748b'} />
          แจ้งเตือนสินค้าใกล้หมด (Low Stock Alert)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '14px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'settings' ? '3px solid #06C755' : '3px solid transparent',
            color: activeTab === 'settings' ? '#047857' : '#64748b',
            fontWeight: activeTab === 'settings' ? 700 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Key size={18} color={activeTab === 'settings' ? '#06C755' : '#64748b'} />
          การเชื่อมต่อ & ตั้งค่า (Connection & Settings)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          style={{
            padding: '14px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'customers' ? '3px solid #06C755' : '3px solid transparent',
            color: activeTab === 'customers' ? '#047857' : '#64748b',
            fontWeight: activeTab === 'customers' ? 700 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <UserCheck size={18} color={activeTab === 'customers' ? '#06C755' : '#64748b'} />
          ส่งใบเสร็จ & ลูกค้าเชื่อมต่อ ({customersQuery.data?.filter(c => c.lineUserId).length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '14px 20px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'logs' ? '3px solid #06C755' : '3px solid transparent',
            color: activeTab === 'logs' ? '#047857' : '#64748b',
            fontWeight: activeTab === 'logs' ? 700 : 500,
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={18} color={activeTab === 'logs' ? '#06C755' : '#64748b'} />
          ประวัติการส่ง (Delivery Logs)
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9', padding: '24px' }}>
        {/* ========================================================
            TAB 1: SMARTPHONE SIMULATOR
            ======================================================== */}
        {activeTab === 'simulator' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
              gap: '24px',
              maxWidth: '1050px',
              margin: '0 auto',
            }}
          >
            {/* Phone Mockup Frame */}
            <div
              style={{
                width: '100%',
                maxWidth: '380px',
                height: '680px',
                background: '#111827',
                borderRadius: '44px',
                padding: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), inset 0 0 2px 2px rgba(255,255,255,0.2)',
                display: 'flex',
                flexDirection: 'column',
                margin: '0 auto',
                position: 'relative',
              }}
            >
              {/* Dynamic Island / Speaker */}
              <div
                style={{
                  width: '120px',
                  height: '24px',
                  background: '#000000',
                  borderRadius: '16px',
                  margin: '0 auto 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#1e293b' }} />
              </div>

              {/* Phone Screen Container */}
              <div
                style={{
                  flex: 1,
                  background: '#8c9fad', // Authentic LINE chat background color
                  borderRadius: '32px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {/* LINE Chat Top Bar */}
                <div
                  style={{
                    background: '#1e2832',
                    color: '#ffffff',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ArrowLeft size={18} color="#ffffff" />
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#06C755',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                      }}
                    >
                      {accountName ? accountName.slice(0, 1) : 'R'}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {accountName || profile.tenant.name}
                        <Check size={12} color="#06C755" strokeWidth={3} />
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                        {basicId || '@rubtang'} · Official Account
                      </div>
                    </div>
                  </div>
                  <MoreVertical size={18} color="#94a3b8" />
                </div>

                {/* Chat Scroll Area */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* Timestamp Pill */}
                  <div
                    style={{
                      alignSelf: 'center',
                      background: 'rgba(0,0,0,0.2)',
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      padding: '2px 8px',
                      borderRadius: '10px',
                    }}
                  >
                    วันนี้ {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* LINE Flex Message E-Receipt Bubble */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      maxWidth: '310px',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        background: '#06C755',
                        color: '#ffffff',
                        padding: '14px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: '#e8fdf0',
                          letterSpacing: '0.5px',
                        }}
                      >
                        E-RECEIPT · ใบเสร็จรับเงินอิเล็กทรอนิกส์
                      </div>
                      <div
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          color: '#ffffff',
                          marginTop: '4px',
                        }}
                      >
                        {profile.tenant.name}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#f0fdf4',
                          marginTop: '2px',
                        }}
                      >
                        เลขที่: {currentSale?.receiptNumber || 'REC-260923-0101'}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '14px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          color: '#64748b',
                        }}
                      >
                        <span>วันที่:</span>
                        <strong style={{ color: '#0f172a' }}>
                          {new Date().toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        <span>สาขา:</span>
                        <strong style={{ color: '#0f172a' }}>
                          {currentSale?.branchName || profile.branches[0]?.name || 'สาขาสุขุมวิท'}
                        </strong>
                      </div>

                      <div
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          margin: '8px 0',
                        }}
                      />

                      {/* Items */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            color: '#334155',
                          }}
                        >
                          <span>กาแฟอเมริกาโน่ × 2</span>
                          <strong style={{ color: '#0f172a' }}>฿110.00</strong>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.75rem',
                            color: '#334155',
                          }}
                        >
                          <span>น้ำดื่ม 600 มล. × 1</span>
                          <strong style={{ color: '#0f172a' }}>฿10.00</strong>
                        </div>
                      </div>

                      <div
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          margin: '8px 0',
                        }}
                      />

                      {/* Subtotal & Discount */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          color: '#64748b',
                        }}
                      >
                        <span>รวมเงิน:</span>
                        <span>฿120.00</span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          color: '#dc2626',
                          marginTop: '2px',
                        }}
                      >
                        <span>ส่วนลดโปรโมชัน:</span>
                        <strong>-฿12.00</strong>
                      </div>

                      {/* Total */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          marginTop: '8px',
                          paddingTop: '6px',
                          borderTop: '1px dashed #cbd5e1',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                          ยอดสุทธิ (Total)
                        </span>
                        <span
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: '#06C755',
                          }}
                        >
                          ฿{currentSale?.total ? Number(currentSale.total).toFixed(2) : '108.00'}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.65rem',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        <span>วิธีชำระ:</span>
                        <span>เงินสด (Cash)</span>
                      </div>

                      {/* Loyalty Points Pill */}
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.7rem',
                          color: '#1d4ed8',
                        }}
                      >
                        <span>สมาชิก: คุณสมชาย ใจดี</span>
                        <strong>+10 แต้ม (รวม: 130)</strong>
                      </div>
                    </div>

                    {/* Footer Button */}
                    <div style={{ padding: '0 14px 14px' }}>
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          background: '#06C755',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <ExternalLink size={14} />
                        ดูใบเสร็จฉบับเต็ม / PDF
                      </button>
                      <div
                        style={{
                          textAlign: 'center',
                          fontSize: '0.6rem',
                          color: '#94a3b8',
                          marginTop: '6px',
                        }}
                      >
                        ขอบคุณที่ใช้บริการ · RubTang POS
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Chat Bar */}
                <div
                  style={{
                    background: '#ffffff',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      background: '#f1f5f9',
                      borderRadius: '16px',
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                    }}
                  >
                    พิมพ์ข้อความ...
                  </div>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#06C755',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <Send size={14} />
                  </div>
                </div>
              </div>
            </div>

            {/* Simulator Controls & Send Test Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Smartphone size={20} color="#059669" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    จำลองการส่งใบเสร็จจริง (Flex Simulator)
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  ทดสอบการจัดวางข้อมูลและหน้าตา E-Receipt ที่ส่งเข้า LINE ของลูกค้าแบบเรียลไทม์
                </p>

                {sendSuccessMessage && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '10px 14px',
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      borderRadius: '8px',
                      color: '#065f46',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {sendSuccessMessage}
                  </div>
                )}

                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      เลือกบิลขายที่ต้องการจำลอง
                    </label>
                    <select
                      value={selectedSaleId}
                      onChange={e => setSelectedSaleId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        background: '#ffffff',
                      }}
                    >
                      {salesQuery.data?.map(sale => (
                        <option key={sale.id} value={sale.id}>
                          {sale.receiptNumber} · ฿{sale.total} ({sale.customer?.name || 'ลูกค้าทั่วไป'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      LINE User ID ของผู้รับ (จำลองหรือบัญชีจริง)
                    </label>
                    <input
                      type="text"
                      value={simulatorLineUserId}
                      onChange={e => setSimulatorLineUserId(e.target.value)}
                      placeholder="เช่น U1234567890abcdef..."
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="primary"
                    disabled={sendReceiptMutation.isPending || !currentSale}
                    onClick={() => {
                      if (currentSale) {
                        sendReceiptMutation.mutate({
                          saleId: currentSale.id,
                          lineUserId: simulatorLineUserId,
                        });
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      background: '#06C755',
                      borderColor: '#06C755',
                      color: '#ffffff',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginTop: '6px',
                    }}
                  >
                    <Send size={16} />
                    {sendReceiptMutation.isPending ? 'กำลังส่ง E-Receipt...' : 'ทดลองส่ง E-Receipt ทันที'}
                  </button>
                </div>
              </div>

              {/* Tips & Specs Box */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '18px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Shield size={18} color="#0284c7" />
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                    ข้อดีของ E-Receipt ผ่าน LINE Official Account
                  </strong>
                </div>
                <ul
                  style={{
                    margin: '8px 0 0',
                    paddingLeft: '18px',
                    fontSize: '0.8rem',
                    color: '#475569',
                    lineHeight: '1.6',
                  }}
                >
                  <li>ลูกค้าไม่ต้องเก็บสลิปกระดาษ ไม่ซีดจาง และไม่สูญหาย</li>
                  <li>เพิ่มยอดผู้ติดตาม (Followers) ใน LINE OA ของร้านโดยอัตโนมัติ</li>
                  <li>เห็นคะแนนสะสมและโปรโมชันทันที กระตุ้นการกลับมาซื้อซ้ำ</li>
                  <li>ประหยัดต้นทุนกระดาษความร้อน ลดขยะ เป็นมิตรต่อสิ่งแวดล้อม (Paperless)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB: STOCK ALERT (LOW STOCK VIA LINE OA)
            ======================================================== */}
        {activeTab === 'stock-alert' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(340px, 420px) minmax(360px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Phone Mockup with Low Stock Alert Flex Bubble */}
            <div
              style={{
                width: '100%',
                maxWidth: '380px',
                height: '680px',
                background: '#111827',
                borderRadius: '44px',
                padding: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), inset 0 0 2px 2px rgba(255,255,255,0.2)',
                display: 'flex',
                flexDirection: 'column',
                margin: '0 auto',
                position: 'relative',
              }}
            >
              {/* Dynamic Island */}
              <div
                style={{
                  width: '120px',
                  height: '24px',
                  background: '#000000',
                  borderRadius: '16px',
                  margin: '0 auto 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#1e293b' }} />
              </div>

              {/* Phone Screen Container */}
              <div
                style={{
                  flex: 1,
                  background: '#8c9fad',
                  borderRadius: '32px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {/* LINE Chat Top Bar */}
                <div
                  style={{
                    background: '#1e2832',
                    color: '#ffffff',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ArrowLeft size={18} color="#ffffff" />
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                      }}
                    >
                      <Bell size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2 }}>
                        {accountName || 'RubTang Alert Bot'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        แจ้งเตือนสต็อกอัตโนมัติ
                      </div>
                    </div>
                  </div>
                  <MoreVertical size={18} color="#94a3b8" />
                </div>

                {/* Chat Message Scroll Area */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      alignSelf: 'center',
                      background: 'rgba(0,0,0,0.2)',
                      color: '#ffffff',
                      fontSize: '0.675rem',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      margin: '4px 0',
                    }}
                  >
                    วันนี้ {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* LINE Flex Bubble (Low Stock Warning) */}
                  <div
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      border: '1px solid rgba(0,0,0,0.06)',
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        background: '#dc2626',
                        padding: '14px 16px',
                        color: '#ffffff',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: '#fee2e2',
                        }}
                      >
                        ⚠️ LOW STOCK ALERT · สินค้าใกล้หมด
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '2px' }}>
                        {profile.tenant.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#fecaca', marginTop: '2px' }}>
                        สาขา: {profile.branches[0]?.name || 'สาขาหลัก'} | ต่ำกว่าเกณฑ์{' '}
                        {lowStockPreviewQuery.data?.totalCount ?? 0} รายการ
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                        <span>เกณฑ์แจ้งเตือน:</span>
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>
                          &le; {lowStockThreshold} ชิ้น
                        </span>
                      </div>

                      <div style={{ height: '1px', background: '#e2e8f0', margin: '10px 0' }} />

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                        {(lowStockPreviewQuery.data?.items?.length ?? 0) === 0 ? (
                          <div style={{ textAlign: 'center', padding: '16px', color: '#16a34a', fontSize: '0.8rem' }}>
                            <CheckCircle2 size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                            ทุกสินค้ามีสต็อกเพียงพอ (ไม่มีสินค้าใกล้หมด)
                          </div>
                        ) : (
                          lowStockPreviewQuery.data?.items.slice(0, 6).map(it => {
                            const isOut = it.quantity <= 0;
                            return (
                              <div
                                key={it.productId}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.75rem',
                                  borderBottom: '1px dashed #f1f5f9',
                                  paddingBottom: '6px',
                                }}
                              >
                                <div style={{ maxWidth: '170px' }}>
                                  <div style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {it.name}
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                    SKU: {it.sku}
                                  </div>
                                </div>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    background: isOut ? '#fef2f2' : '#fffbeb',
                                    color: isOut ? '#dc2626' : '#d97706',
                                    border: `1px solid ${isOut ? '#fecaca' : '#fef3c7'}`,
                                  }}
                                >
                                  {isOut ? 'หมดสต็อก' : `เหลือ ${it.quantity}`}
                                </span>
                              </div>
                            );
                          })
                        )}
                        {(lowStockPreviewQuery.data?.items?.length ?? 0) > 6 && (
                          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#64748b', marginTop: '4px' }}>
                            ...และอีก {(lowStockPreviewQuery.data?.items?.length ?? 0) - 6} รายการ
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      <div
                        style={{
                          background: '#dc2626',
                          color: '#ffffff',
                          textAlign: 'center',
                          padding: '8px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                        }}
                      >
                        เปิดดูสต็อก / สั่งซื้อเพิ่ม
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#94a3b8', marginTop: '6px' }}>
                        ระบบแจ้งเตือนสต็อกอัตโนมัติ · RubTang POS
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Alert Operations & Threshold Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {stockAlertSuccessMessage && (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#065f46',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <CheckCircle2 size={18} color="#059669" />
                  <span>{stockAlertSuccessMessage}</span>
                </div>
              )}

              {/* Status summary cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                    สินค้าใกล้หมดทั้งหมด
                  </span>
                  <strong style={{ fontSize: '1.4rem', color: (lowStockPreviewQuery.data?.totalCount ?? 0) > 0 ? '#dc2626' : '#16a34a' }}>
                    {lowStockPreviewQuery.data?.totalCount ?? 0}
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b', marginLeft: '4px' }}>รายการ</span>
                  </strong>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                    สินค้าหมดสต็อก (0 ชิ้น)
                  </span>
                  <strong style={{ fontSize: '1.4rem', color: (lowStockPreviewQuery.data?.outOfStockCount ?? 0) > 0 ? '#b91c1c' : '#16a34a' }}>
                    {lowStockPreviewQuery.data?.outOfStockCount ?? 0}
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b', marginLeft: '4px' }}>รายการ</span>
                  </strong>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                    แจ้งเตือนล่าสุด
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: 600, marginTop: '4px' }}>
                    {settingsQuery.data?.lowStockLastAlertAt
                      ? new Date(settingsQuery.data.lowStockLastAlertAt).toLocaleString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'ยังไม่เคยส่ง'}
                  </span>
                </div>
              </div>

              {/* Alert Actions Box */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
                      ส่งการแจ้งเตือนสต็อกต่ำ (Push Alert to LINE)
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                      ยิงข้อความ LINE Flex Message ไปยัง LINE บัญชีผู้จัดการหรือกลุ่มร้านค้าทันที
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    disabled={sendLowStockMutation.isPending || (lowStockPreviewQuery.data?.totalCount ?? 0) === 0}
                    onClick={() => {
                      sendLowStockMutation.mutate({
                        branchId: profile.branches[0]?.id,
                        threshold: lowStockThreshold,
                        targetLineUserId: lowStockTargetUserId.trim() || undefined,
                      });
                    }}
                    style={{
                      background: '#dc2626',
                      borderColor: '#dc2626',
                      padding: '10px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                    }}
                  >
                    <Send size={16} />
                    {sendLowStockMutation.isPending ? 'กำลังส่งแจ้งเตือน...' : 'ส่งแจ้งเตือน LINE เดี๋ยวนี้'}
                  </button>
                </div>
              </div>

              {/* Settings Configuration Card */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
                  ตั้งค่าเกณฑ์การแจ้งเตือน (Alert Settings)
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block' }}>
                      เปิดใช้งานการแจ้งเตือนสต็อกอัตโนมัติ
                    </strong>
                    <span style={{ fontSize: '0.785rem', color: '#64748b' }}>
                      ระบบจะตรวจจับสินค้าคงคลังและแจ้งเตือนเมื่อสินค้าลดลงถึงเกณฑ์ที่กำหนด
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={lowStockAlertEnabled}
                    onChange={e => setLowStockAlertEnabled(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      เกณฑ์สต็อกต่ำ (ชิ้น)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={lowStockThreshold}
                      onChange={e => setLowStockThreshold(Number(e.target.value) || 1)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      LINE User ID / Group ID ผู้รับการแจ้งเตือน
                    </label>
                    <input
                      type="text"
                      value={lowStockTargetUserId}
                      onChange={e => setLowStockTargetUserId(e.target.value)}
                      placeholder="เช่น U1a2b3c4d... หรือปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="primary"
                    disabled={updateSettingsMutation.isPending}
                    onClick={() => {
                      updateSettingsMutation.mutate({
                        accountName,
                        basicId: basicId || null,
                        channelId: channelId || null,
                        channelSecret: channelSecret || null,
                        channelAccessToken: channelAccessToken || null,
                        autoSendReceipt,
                        welcomeMessage: welcomeMessage || null,
                        lowStockAlertEnabled,
                        lowStockThreshold: Number(lowStockThreshold) || 5,
                        lowStockTargetUserId: lowStockTargetUserId.trim() || null,
                      });
                    }}
                    style={{ background: '#059669', borderColor: '#059669', padding: '8px 16px', fontSize: '0.85rem' }}
                  >
                    <Check size={14} />
                    {updateSettingsMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าสต็อก'}
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#0f172a' }}>
                  รายการสินค้าที่เข้าเกณฑ์ใกล้หมด ({lowStockPreviewQuery.data?.totalCount ?? 0} รายการ)
                </h3>

                {(lowStockPreviewQuery.data?.items?.length ?? 0) === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                    ไม่มีรายการสินค้าที่คงเหลือต่ำกว่าหรือเท่ากับ {lowStockThreshold} ชิ้น
                  </p>
                ) : (
                  <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>ชื่อสินค้า</th>
                          <th style={{ padding: '8px 10px' }}>SKU</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>คงเหลือ</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStockPreviewQuery.data?.items.map(it => {
                          const isOut = it.quantity <= 0;
                          return (
                            <tr key={it.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>
                                {it.name}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#64748b' }}>
                                {it.sku}
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: isOut ? '#dc2626' : '#d97706',
                                }}
                              >
                                {it.quantity} ชิ้น
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '0.725rem',
                                    fontWeight: 700,
                                    background: isOut ? '#fef2f2' : '#fffbeb',
                                    color: isOut ? '#dc2626' : '#d97706',
                                  }}
                                >
                                  {isOut ? 'หมดสต็อก' : 'ใกล้หมด'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: CONNECTION & SETTINGS
            ======================================================== */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '780px', margin: '0 auto' }}>
            <form
              onSubmit={handleSaveSettings}
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
              }}
            >
              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                  ตั้งค่าการเชื่อมต่อ LINE Messaging API
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  นำข้อมูลจาก LINE Developers Console (Messaging API Channel) มากรอกเพื่อเปิดใช้งานส่งใบเสร็จจริง
                </p>
              </div>

              {savedNotice && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    color: '#065f46',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  {savedNotice}
                </div>
              )}

              {/* Account Name & Basic ID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    ชื่อบัญชี LINE Official Account *
                  </label>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    placeholder="เช่น ร้านรับตังค์ คาเฟ่"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    LINE Basic ID / Search ID
                  </label>
                  <input
                    type="text"
                    value={basicId}
                    onChange={e => setBasicId(e.target.value)}
                    placeholder="เช่น @rubtang_cafe"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              {/* Channel ID & Secret */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Channel ID
                  </label>
                  <input
                    type="text"
                    value={channelId}
                    onChange={e => setChannelId(e.target.value)}
                    placeholder="เช่น 2001234567"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Channel Secret
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={channelSecret}
                      onChange={e => setChannelSecret(e.target.value)}
                      placeholder="เช่น a1b2c3d4e5f6..."
                      style={{
                        width: '100%',
                        padding: '9px 36px 9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Channel Access Token */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Channel Access Token (Long-lived)
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    rows={3}
                    value={channelAccessToken}
                    onChange={e => setChannelAccessToken(e.target.value)}
                    placeholder="กรอก Channel Access Token ที่ออกให้จาก LINE Developers Console..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.825rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>
                  หากอยู่ในโหมดทดลอง/เดโม สามารถใส่ token จำลอง เช่น <code>mock_token_123</code> เพื่อทดสอบหน้าจอได้ทันที
                </small>
              </div>

              {/* Auto Send Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>
                    ส่ง E-Receipt อัตโนมัติทันทีที่ชำระเงิน (Auto Send on Checkout)
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    หากลูกค้าเป็นสมาชิกที่ผูกบัญชี LINE ไว้ ระบบจะส่งใบเสร็จ Flex Message เข้า LINE ทันทีโดยไม่ต้องกดส่งเอง
                  </span>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                  <input
                    type="checkbox"
                    checked={autoSendReceipt}
                    onChange={e => setAutoSendReceipt(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: autoSendReceipt ? '#06C755' : '#cbd5e1',
                      borderRadius: '24px',
                      transition: '0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        content: '',
                        height: '18px',
                        width: '18px',
                        left: autoSendReceipt ? '26px' : '4px',
                        bottom: '3px',
                        background: 'white',
                        borderRadius: '50%',
                        transition: '0.2s',
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Low Stock Notification Toggle & Settings */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a', display: 'block' }}>
                      แจ้งเตือนสินค้าใกล้หมดอัตโนมัติ (Low Stock Alert)
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      ส่งการแจ้งเตือน LINE Flex Message เมื่อสต็อกสินค้าลดลงถึงเกณฑ์ที่กำหนด
                    </span>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                    <input
                      type="checkbox"
                      checked={lowStockAlertEnabled}
                      onChange={e => setLowStockAlertEnabled(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: lowStockAlertEnabled ? '#dc2626' : '#cbd5e1',
                        borderRadius: '24px',
                        transition: '0.2s',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          content: '',
                          height: '18px',
                          width: '18px',
                          left: lowStockAlertEnabled ? '26px' : '4px',
                          bottom: '3px',
                          background: 'white',
                          borderRadius: '50%',
                          transition: '0.2s',
                        }}
                      />
                    </span>
                  </label>
                </div>

                {lowStockAlertEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px', marginTop: '4px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        เกณฑ์สต็อกต่ำ (ชิ้น)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={lowStockThreshold}
                        onChange={e => setLowStockThreshold(Number(e.target.value) || 1)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        LINE User ID / Group ID ผู้รับแจ้งเตือนสต็อก
                      </label>
                      <input
                        type="text"
                        value={lowStockTargetUserId}
                        onChange={e => setLowStockTargetUserId(e.target.value)}
                        placeholder="เช่น U123... (เว้นว่างไว้จะส่งไปยังแอดมิน)"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Welcome Message */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  ข้อความต้อนรับเมื่อลูกค้าเพิ่มเพื่อน (Welcome Note)
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={e => setWelcomeMessage(e.target.value)}
                  placeholder="เช่น ยินดีต้อนรับสู่ร้านรับตังค์ สะสมแต้มและรับใบเสร็จผ่าน LINE ได้ทันที"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={testConnectionMutation.isPending}
                >
                  <RefreshCw size={14} />
                  ทดสอบการเชื่อมต่อ
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={updateSettingsMutation.isPending}
                  style={{ background: '#06C755', borderColor: '#06C755' }}
                >
                  <Check size={16} />
                  {updateSettingsMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================
            TAB 3: CUSTOMERS & SEND RECEIPT
            ======================================================== */}
        {activeTab === 'customers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Customer Search & Overview */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                    รายชื่อสมาชิกและสถานะการเชื่อมต่อ LINE
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    ผูกบัญชี LINE User ID เพื่อให้ระบบส่งใบเสร็จและแต้มสะสมเข้า LINE ของลูกค้าโดยอัตโนมัติ
                  </p>
                </div>

                <div style={{ position: 'relative', width: '280px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, เบอร์โทร หรือ LINE ID..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              {/* Customers Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>ลูกค้า / สมาชิก</th>
                      <th style={{ padding: '10px 14px' }}>เบอร์โทรศัพท์</th>
                      <th style={{ padding: '10px 14px' }}>แต้มสะสม</th>
                      <th style={{ padding: '10px 14px' }}>สถานะ LINE</th>
                      <th style={{ padding: '10px 14px' }}>LINE User ID / ชื่อ</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map(customer => {
                      const isLinked = Boolean(customer.lineUserId);
                      return (
                        <tr
                          key={customer.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isLinked ? '#f0fdf4' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{customer.name}</div>
                            <span style={{ fontSize: '0.725rem', color: '#64748b' }}>ระดับ: {customer.tier || 'BRONZE'}</span>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>{customer.phone}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0284c7' }}>
                            {customer.points.toLocaleString()} แต้ม
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {isLinked ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: '#dcfce7',
                                  color: '#16a34a',
                                  padding: '3px 8px',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                }}
                              >
                                <CheckCircle2 size={13} />
                                เชื่อมต่อแล้ว
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: '#f1f5f9',
                                  color: '#64748b',
                                  padding: '3px 8px',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                }}
                              >
                                ยังไม่เชื่อมต่อ
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                            {isLinked ? (
                              <div>
                                <div>{customer.lineDisplayName || '-'}</div>
                                <small style={{ color: '#94a3b8' }}>{customer.lineUserId}</small>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {isLinked ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  if (confirm(`ต้องการยกเลิกการผูกบัญชี LINE ของ “${customer.name}” หรือไม่?`)) {
                                    unlinkCustomerMutation.mutate(customer.id);
                                  }
                                }}
                                style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#dc2626' }}
                              >
                                <Unlink size={13} />
                                ยกเลิกผูก
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setLinkingCustomer(customer);
                                  setInputLineUserId('');
                                  setInputLineDisplayName(customer.name);
                                }}
                                style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#06C755' }}
                              >
                                <Link2 size={13} />
                                ผูก LINE
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Link Customer LINE Modal */}
            {linkingCustomer && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '24px',
                    width: 'min(450px, 92vw)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                      ผูกบัญชี LINE กับสมาชิก: {linkingCustomer.name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setLinkingCustomer(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (linkingCustomer && inputLineUserId.trim()) {
                        linkCustomerMutation.mutate({
                          customerId: linkingCustomer.id,
                          payload: {
                            lineUserId: inputLineUserId.trim(),
                            lineDisplayName: inputLineDisplayName.trim() || linkingCustomer.name,
                          },
                        });
                      }
                    }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        LINE User ID (ขึ้นต้นด้วย U...) *
                      </label>
                      <input
                        type="text"
                        required
                        value={inputLineUserId}
                        onChange={e => setInputLineUserId(e.target.value)}
                        placeholder="เช่น U1a2b3c4d5e6f7..."
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        ชื่อแสดงผลใน LINE
                      </label>
                      <input
                        type="text"
                        value={inputLineDisplayName}
                        onChange={e => setInputLineDisplayName(e.target.value)}
                        placeholder={linkingCustomer.name}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                      <button type="button" className="secondary" onClick={() => setLinkingCustomer(null)}>
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="primary"
                        disabled={linkCustomerMutation.isPending || !inputLineUserId.trim()}
                        style={{ background: '#06C755', borderColor: '#06C755' }}
                      >
                        {linkCustomerMutation.isPending ? 'กำลังบันทึก...' : 'ยืนยันการผูก LINE'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 4: DELIVERY LOGS
            ======================================================== */}
        {activeTab === 'logs' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  ประวัติการส่งใบเสร็จ E-Receipt ทั้งหมด
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  บันทึกประวัติข้อความ Flex Message ที่ส่งให้ลูกค้า ตรวจสอบสถานะและเวลาส่ง
                </p>
              </div>

              <button
                type="button"
                className="secondary"
                onClick={() => logsQuery.refetch()}
                style={{ padding: '6px 12px', fontSize: '0.825rem' }}
              >
                <RefreshCw size={14} style={{ animation: logsQuery.isFetching ? 'spin 1s linear infinite' : 'none' }} />
                รีเฟรช
              </button>
            </div>

            {logsQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังโหลดประวัติ...</div>
            ) : !logsQuery.data?.items?.length ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                <Clock size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>ยังไม่มีประวัติการส่ง E-Receipt ในระบบ</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>เวลาที่ส่ง</th>
                      <th style={{ padding: '10px 14px' }}>เลขที่บิลขาย</th>
                      <th style={{ padding: '10px 14px' }}>ผู้รับ (ลูกค้า)</th>
                      <th style={{ padding: '10px 14px' }}>LINE User ID</th>
                      <th style={{ padding: '10px 14px' }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsQuery.data.items.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>
                          {new Date(log.sentAt).toLocaleString('th-TH')}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>
                          {log.receiptNumber}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {log.customer?.name || 'ลูกค้าทั่วไป'}
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                          {log.lineUserId}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: log.status === 'SENT' ? '#dcfce7' : '#fee2e2',
                              color: log.status === 'SENT' ? '#16a34a' : '#dc2626',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.725rem',
                              fontWeight: 600,
                            }}
                          >
                            {log.status === 'SENT' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                            {log.status === 'SENT' ? 'ส่งสำเร็จ' : 'ล้มเหลว'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
