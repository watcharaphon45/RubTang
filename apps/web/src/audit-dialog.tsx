import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Filter,
  History,
  Layers,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import {
  AuditLogItem,
  AuditQueryParams,
  getAuditLogs,
  getAuditMetrics,
  Profile,
} from './api';

const CATEGORY_OPTIONS = [
  { value: '', label: 'ทุกหมวดหมู่' },
  { value: 'SALES', label: 'ขายหน้าร้าน (Sales)' },
  { value: 'INVENTORY', label: 'คลัง & สต็อก (Inventory)' },
  { value: 'CATALOG', label: 'สินค้า (Catalog)' },
  { value: 'SHIFT', label: 'กะเงินสด (Shift)' },
  { value: 'MARKETING', label: 'โปรโมชัน & แต้ม (Marketing)' },
  { value: 'PROCUREMENT', label: 'จัดซื้อ (Procurement)' },
  { value: 'ADMIN', label: 'ตั้งค่าร้าน & พนักงาน (Admin)' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'ทุกระดับความสำคัญ' },
  { value: 'INFO', label: 'ทั่วไป (Info)' },
  { value: 'WARNING', label: 'สำคัญ (Warning)' },
  { value: 'CRITICAL', label: 'วิกฤต / ความเสี่ยงสูง (Critical)' },
];

function formatThaiDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function getSeverityBadge(severity?: string) {
  switch (severity) {
    case 'CRITICAL':
      return {
        bg: '#fee2e2',
        color: '#dc2626',
        border: '#fca5a5',
        icon: <ShieldAlert size={14} />,
        label: 'วิกฤต (Critical)',
      };
    case 'WARNING':
      return {
        bg: '#fef3c7',
        color: '#d97706',
        border: '#fcd34d',
        icon: <AlertTriangle size={14} />,
        label: 'สำคัญ (Warning)',
      };
    default:
      return {
        bg: '#e0f2fe',
        color: '#0284c7',
        border: '#bae6fd',
        icon: <Shield size={14} />,
        label: 'ทั่วไป (Info)',
      };
  }
}

function getCategoryBadge(category?: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    SALES: { label: 'การขาย', color: '#16a34a', bg: '#dcfce7' },
    INVENTORY: { label: 'สต็อก', color: '#0284c7', bg: '#e0f2fe' },
    CATALOG: { label: 'สินค้า', color: '#7c3aed', bg: '#f3e8ff' },
    SHIFT: { label: 'กะเงินสด', color: '#ea580c', bg: '#ffedd5' },
    MARKETING: { label: 'โปรโมชัน', color: '#db2777', bg: '#fce7f3' },
    PROCUREMENT: { label: 'จัดซื้อ', color: '#4b5563', bg: '#f3f4f6' },
    ADMIN: { label: 'ระบบ', color: '#4f46e5', bg: '#e0e7ff' },
  };
  return map[category || ''] || { label: category || 'ทั่วไป', color: '#6b7280', bg: '#f3f4f6' };
}

export function AuditDialog({
  profile,
  close,
}: {
  profile: Profile;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Selected item state
  const [selectedAudit, setSelectedAudit] = useState<AuditLogItem | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch metrics
  const metricsQuery = useQuery({
    queryKey: ['audit-metrics'],
    queryFn: () => getAuditMetrics(),
    refetchInterval: 30000,
  });

  // Query params
  const queryParams: AuditQueryParams = useMemo(() => {
    return {
      limit: pageSize,
      offset: page * pageSize,
      category: categoryFilter || undefined,
      search: searchTerm.trim() || undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
    };
  }, [categoryFilter, searchTerm, startDate, endDate, page, pageSize]);

  // Fetch audits
  const auditsQuery = useQuery({
    queryKey: ['audits', queryParams],
    queryFn: () => getAuditLogs(queryParams),
  });

  // Filter by severity client-side if selected (since backend query handles category/action/search)
  const items = useMemo(() => {
    const list = auditsQuery.data?.items || [];
    if (!severityFilter) return list;
    return list.filter(item => item.severity === severityFilter);
  }, [auditsQuery.data?.items, severityFilter]);

  // Auto-select first item if none selected
  useEffect(() => {
    if (items.length > 0 && (!selectedAudit || !items.some(i => i.id === selectedAudit.id))) {
      setSelectedAudit(items[0]);
    } else if (items.length === 0) {
      setSelectedAudit(null);
    }
  }, [items, selectedAudit]);

  const totalPages = Math.ceil((auditsQuery.data?.total || 0) / pageSize);

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (!items || items.length === 0) return;

    const headers = [
      'ID',
      'วันที่และเวลา',
      'หมวดหมู่',
      'การกระทำ (Action)',
      'ความสำคัญ (Severity)',
      'ผู้ทำรายการ',
      'อีเมล',
      'Entity Type',
      'Entity ID',
      'รายละเอียด (JSON)',
    ];

    const rows = items.map(item => [
      `"${item.id}"`,
      `"${formatThaiDateTime(item.createdAt)}"`,
      `"${item.category || ''}"`,
      `"${item.actionLabel || item.action}"`,
      `"${item.severity || 'INFO'}"`,
      `"${item.actor?.displayName || item.actorUserId}"`,
      `"${item.actor?.email || ''}"`,
      `"${item.entityType}"`,
      `"${item.entityId || ''}"`,
      `"${JSON.stringify(item.details || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `audit-trail-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const metrics = metricsQuery.data;

  return (
    <dialog
      ref={dialog}
      className="modal audit-dialog"
      style={{
        width: 'min(1200px, 98vw)',
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
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <History size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                ระบบบันทึกประวัติการตรวจสอบ (Audit Trail)
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                }}
              >
                ENTERPRISE
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              ติดตามทุกการแก้ไขข้อมูล การตัดสต็อก การโอนย้าย และธุรกรรมสำคัญระดับระบบแบบเรียลไทม์
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void auditsQuery.refetch();
              void metricsQuery.refetch();
            }}
            style={{
              padding: '7px 12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderColor: '#475569',
              color: '#e2e8f0',
            }}
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw
              size={15}
              style={{
                animation: auditsQuery.isFetching ? 'spin 1s linear infinite' : 'none',
              }}
            />
            รีเฟรช
          </button>

          <button
            type="button"
            className="secondary"
            onClick={handleExportCsv}
            disabled={!items || items.length === 0}
            style={{
              padding: '7px 12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderColor: '#475569',
              color: '#e2e8f0',
            }}
          >
            <Download size={15} />
            ส่งออก CSV
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="ปิด"
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#cbd5e1',
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

      {/* Metrics Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          padding: '14px 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {/* Today */}
        <div
          style={{
            background: '#ffffff',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#e0f2fe',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              กิจกรรมวันนี้
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {metrics ? metrics.todayCount.toLocaleString() : '...'}
            </div>
          </div>
        </div>

        {/* 7 Days */}
        <div
          style={{
            background: '#ffffff',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              กิจกรรม 7 วันที่ผ่านมา
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {metrics ? metrics.weekCount.toLocaleString() : '...'}
            </div>
          </div>
        </div>

        {/* Critical Actions */}
        <div
          style={{
            background: '#ffffff',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>
              รายการวิกฤต (Critical)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>
              {metrics ? metrics.criticalCount.toLocaleString() : '...'}
            </div>
          </div>
        </div>

        {/* Total Actions */}
        <div
          style={{
            background: '#ffffff',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#f3e8ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              บันทึกทั้งหมดในระบบ
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
              {metrics ? metrics.totalCount.toLocaleString() : (auditsQuery.data?.total || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          padding: '12px 24px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div
          style={{
            flex: '1 1 240px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={16}
            style={{ position: 'absolute', left: '12px', color: '#94a3b8' }}
          />
          <input
            type="text"
            placeholder="ค้นหาตามการกระทำ, ผู้ทำรายการ, รหัสอ้างอิง..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPage(0);
              }}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Select */}
        <select
          value={categoryFilter}
          onChange={e => {
            setCategoryFilter(e.target.value);
            setPage(0);
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.875rem',
            background: '#ffffff',
            color: '#1e293b',
          }}
        >
          {CATEGORY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Severity Select */}
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.875rem',
            background: '#ffffff',
            color: '#1e293b',
          }}
        >
          {SEVERITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Date Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="date"
            value={startDate}
            onChange={e => {
              setStartDate(e.target.value);
              setPage(0);
            }}
            aria-label="ตั้งแต่วันที่"
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.825rem',
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '0.825rem' }}>ถึง</span>
          <input
            type="date"
            value={endDate}
            onChange={e => {
              setEndDate(e.target.value);
              setPage(0);
            }}
            aria-label="ถึงวันที่"
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.825rem',
            }}
          />
        </div>

        {(categoryFilter || severityFilter || startDate || endDate || searchTerm) && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setCategoryFilter('');
              setSeverityFilter('');
              setStartDate('');
              setEndDate('');
              setSearchTerm('');
              setPage(0);
            }}
            style={{
              padding: '7px 12px',
              fontSize: '0.825rem',
              color: '#dc2626',
              borderColor: '#fca5a5',
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Main Body: 2-Column Feed + Inspector */}
      <div className="audit-body"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 480px) 1fr',
          flex: 1,
          overflow: 'hidden',
          background: '#f1f5f9',
        }}
      >
        {/* Left Column: Events Feed */}
        <div
          style={{
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            overflow: 'hidden',
          }}
        >
          {/* List Header */}
          <div
            style={{
              padding: '10px 16px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.825rem',
              color: '#64748b',
            }}
          >
            <span>
              แสดง {items.length} จาก {auditsQuery.data?.total || 0} รายการ
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                    opacity: page === 0 ? 0.5 : 1,
                  }}
                  title="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: page + 1 >= totalPages ? 0.5 : 1,
                  }}
                  title="หน้าถัดไป"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* List Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {auditsQuery.isLoading ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <RefreshCw
                  size={28}
                  style={{
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px',
                    display: 'block',
                    color: '#0284c7',
                  }}
                />
                กำลังโหลดบันทึกการตรวจสอบ...
              </div>
            ) : items.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  color: '#94a3b8',
                }}
              >
                <History
                  size={36}
                  style={{ margin: '0 auto 12px', opacity: 0.6 }}
                />
                <p style={{ margin: 0, fontWeight: 500, color: '#64748b' }}>
                  ไม่พบบันทึกการตรวจสอบตามเงื่อนไข
                </p>
                <small style={{ color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                  ลองปรับเปลี่ยนตัวกรอง หรือค้นหาด้วยคำอื่น
                </small>
              </div>
            ) : (
              items.map(item => {
                const isSelected = selectedAudit?.id === item.id;
                const severity = getSeverityBadge(item.severity);
                const category = getCategoryBadge(item.category);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedAudit(item);
                      setShowRawJson(false);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isSelected
                        ? '2px solid #0284c7'
                        : '1px solid #e2e8f0',
                      background: isSelected ? '#f0f9ff' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected
                        ? '0 2px 8px rgba(2, 132, 199, 0.15)'
                        : 'none',
                    }}
                  >
                    {/* Item Row 1: Badges & Time */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: severity.bg,
                            color: severity.color,
                            border: `1px solid ${severity.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          {severity.icon}
                          {item.severity || 'INFO'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: category.bg,
                            color: category.color,
                          }}
                        >
                          {category.label}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatThaiDateTime(item.createdAt)}
                      </span>
                    </div>

                    {/* Item Row 2: Title / Action */}
                    <div
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: isSelected ? '#0369a1' : '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{item.actionLabel || item.action}</span>
                      {isSelected && <ArrowRight size={14} color="#0284c7" />}
                    </div>

                    {/* Item Row 3: Actor & Entity */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.775rem',
                        color: '#64748b',
                        marginTop: '2px',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={13} color="#94a3b8" />
                        <strong>
                          {item.actor?.displayName || item.actorUserId.slice(0, 8)}
                        </strong>
                      </span>
                      <span
                        style={{
                          background: '#f1f5f9',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                        }}
                      >
                        {item.entityType}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Inspector Panel */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {selectedAudit ? (
            <>
              {/* Header Box */}
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
                    alignItems: 'flex-start',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                      }}
                    >
                      {(() => {
                        const sev = getSeverityBadge(selectedAudit.severity);
                        return (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: sev.bg,
                              color: sev.color,
                              border: `1px solid ${sev.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {sev.icon}
                            {sev.label}
                          </span>
                        );
                      })()}

                      {(() => {
                        const cat = getCategoryBadge(selectedAudit.category);
                        return (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: cat.bg,
                              color: cat.color,
                            }}
                          >
                            {cat.label}
                          </span>
                        );
                      })()}

                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          background: '#f1f5f9',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          color: '#475569',
                        }}
                      >
                        {selectedAudit.action}
                      </span>
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.35rem',
                        fontWeight: 700,
                        color: '#0f172a',
                      }}
                    >
                      {selectedAudit.actionLabel || selectedAudit.action}
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="secondary"
                    onClick={() => copyToClipboard(selectedAudit.id)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {copiedId ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    {copiedId ? 'คัดลอก ID แล้ว' : 'คัดลอก Log ID'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    padding: '12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>
                      ผู้ดำเนินการ (Actor)
                    </span>
                    <strong style={{ color: '#0f172a' }}>
                      {selectedAudit.actor?.displayName || selectedAudit.actorUserId}
                    </strong>
                    {selectedAudit.actor?.email && (
                      <span style={{ display: 'block', color: '#64748b', fontSize: '0.75rem' }}>
                        {selectedAudit.actor.email}
                      </span>
                    )}
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>
                      วันและเวลาที่บันทึก
                    </span>
                    <strong style={{ color: '#0f172a' }}>
                      {formatThaiDateTime(selectedAudit.createdAt)}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>
                      เป้าหมาย (Target Entity)
                    </span>
                    <strong style={{ color: '#0f172a' }}>
                      {selectedAudit.entityType}
                    </strong>
                    {selectedAudit.entityId && (
                      <span
                        style={{
                          display: 'block',
                          fontFamily: 'monospace',
                          color: '#64748b',
                          fontSize: '0.75rem',
                        }}
                      >
                        {selectedAudit.entityId}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* State Diff / Visual Inspector */}
              {selectedAudit.details && (selectedAudit.details.before || selectedAudit.details.after) && (
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 14px',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Layers size={18} color="#0284c7" />
                    การเปลี่ยนแปลงสถานะ (Before vs After Diff)
                  </h4>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '14px',
                    }}
                  >
                    {/* Before */}
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#dc2626',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#dc2626',
                          }}
                        />
                        ก่อนทำรายการ (BEFORE)
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: '#7f1d1d',
                        }}
                      >
                        {JSON.stringify(selectedAudit.details.before, null, 2)}
                      </pre>
                    </div>

                    {/* After */}
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#16a34a',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#16a34a',
                          }}
                        />
                        หลังทำรายการ (AFTER)
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          color: '#14532d',
                        }}
                      >
                        {JSON.stringify(selectedAudit.details.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Important Highlight Banner if Void or Reason exists */}
              {(selectedAudit.details?.voidReason || selectedAudit.details?.reason) && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <AlertCircle size={20} color="#d97706" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>
                      เหตุผลในการทำรายการ
                    </div>
                    <p style={{ margin: '4px 0 0', color: '#78350f', fontSize: '0.875rem' }}>
                      {selectedAudit.details?.voidReason || selectedAudit.details?.reason}
                    </p>
                  </div>
                </div>
              )}

              {/* Key Details Metadata Grid */}
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
                    marginBottom: '12px',
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  >
                    ข้อมูลบันทึกเพิ่มเติม (Transaction Metadata)
                  </h4>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowRawJson(!showRawJson)}
                    style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  >
                    {showRawJson ? 'ซ่อน Raw JSON' : 'ดู Raw JSON'}
                  </button>
                </div>

                {showRawJson ? (
                  <pre
                    style={{
                      background: '#1e293b',
                      color: '#38bdf8',
                      padding: '14px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      maxHeight: '300px',
                    }}
                  >
                    {JSON.stringify(selectedAudit.details, null, 2)}
                  </pre>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {Object.entries(selectedAudit.details || {})
                      .filter(([key]) => key !== 'before' && key !== 'after')
                      .map(([key, val]) => (
                        <div
                          key={key}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              display: 'block',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {key}
                          </span>
                          <strong
                            style={{
                              fontSize: '0.9rem',
                              color: '#0f172a',
                              wordBreak: 'break-all',
                            }}
                          >
                            {typeof val === 'object' && val !== null
                              ? JSON.stringify(val)
                              : String(val)}
                          </strong>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
              }}
            >
              <History size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
              <p style={{ margin: 0, fontWeight: 500, color: '#64748b' }}>
                เลือกรายการจากแถบด้านซ้ายเพื่อดูรายละเอียด
              </p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
