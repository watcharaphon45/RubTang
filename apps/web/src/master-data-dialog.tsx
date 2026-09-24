import React, { CSSProperties, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Edit2,
  FileCheck,
  FileText,
  Filter,
  Info,
  Layers,
  Lock,
  LockOpen,
  Menu,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Sliders,
  SlidersHorizontal,
  Square,
  Truck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuditActionDefinition,
  createPosition,
  CreatePositionInput,
  getAuditActionDefinitions,
  getManageableMenus,
  getPositionMatrix,
  getPositions,
  getSystemStatuses,
  NavigationMenuItem,
  Position,
  PositionMatrixResponse,
  Profile,
  SystemStatusDefinition,
  updateAuditActionDefinition,
  UpdateAuditActionDefinitionInput,
  updateNavigationMenu,
  UpdateNavigationMenuInput,
  updatePosition,
  updatePositionPermissions,
  updateSystemStatus,
  UpdateSystemStatusInput,
} from './api';
import { DynamicStatusBadge } from './components/status-badge';

const PRESET_COLORS = [
  { label: 'เขียวสำเร็จ', color: '#16825d', bg: '#e8f5ed' },
  { label: 'เหลือง/ส้มรอดำเนินการ', color: '#a36600', bg: '#fff5df' },
  { label: 'แดงยกเลิก/วิกฤต', color: '#c23f45', bg: '#fff1f2' },
  { label: 'ฟ้าคำสั่งซื้อ', color: '#0284c7', bg: '#e0f2fe' },
  { label: 'ม่วงคืนสินค้า', color: '#7c3aed', bg: '#ede9fe' },
  { label: 'เทาแบบร่าง/ปิด', color: '#64748b', bg: '#f1f5f9' },
  { label: 'ส้มอิฐโอนออก', color: '#d97706', bg: '#fef3c7' },
];

const DOMAIN_LABELS: Record<string, string> = {
  ALL: 'ทั้งหมด',
  TRANSFER: 'ใบโอนสินค้า',
  SALE: 'การขาย (Sales)',
  SHIFT: 'กะเงินสด (Shift)',
  PURCHASE_ORDER: 'ใบสั่งซื้อ (PO)',
  STOCK_TAKE: 'ตรวจนับสต็อก',
  TAX_INVOICE: 'ใบกำกับภาษี',
  MOVEMENT: 'สต็อกเคลื่อนไหว',
};

const ICONS_LIST = [
  'Truck',
  'CheckCircle2',
  'XCircle',
  'RotateCcw',
  'Ban',
  'LockOpen',
  'Lock',
  'FileText',
  'Send',
  'Clock',
  'FileCheck',
  'ArrowDownLeft',
  'ArrowUpRight',
  'Sliders',
  'ShoppingBag',
];

export function MasterDataDialog({ profile, close }: { profile: Profile; close: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'STATUSES' | 'AUDIT_ACTIONS' | 'MENUS'>('STATUSES');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [editingStatus, setEditingStatus] = useState<SystemStatusDefinition | null>(null);
  const [editingAudit, setEditingAudit] = useState<AuditActionDefinition | null>(null);
  const [editingMenu, setEditingMenu] = useState<NavigationMenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Queries
  const statusesQuery = useQuery({
    queryKey: ['system-statuses', 'ALL'],
    queryFn: () => getSystemStatuses(),
  });

  const auditsQuery = useQuery({
    queryKey: ['audit-definitions'],
    queryFn: () => getAuditActionDefinitions(),
  });

  const menusQuery = useQuery({
    queryKey: ['manageable-menus'],
    queryFn: () => getManageableMenus(),
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ domain, code, data }: { domain: string; code: string; data: UpdateSystemStatusInput }) =>
      updateSystemStatus(domain, code, data),
    onSuccess: (updated) => {
      setNotice(`บันทึกการตั้งค่าสถานะ "${updated.label}" เรียบร้อยแล้ว`);
      setEditingStatus(null);
      void queryClient.invalidateQueries({ queryKey: ['system-statuses'] });
    },
  });

  const updateAuditMutation = useMutation({
    mutationFn: ({ action, data }: { action: string; data: UpdateAuditActionDefinitionInput }) =>
      updateAuditActionDefinition(action, data),
    onSuccess: (updated) => {
      setNotice(`บันทึกคำจำกัดความ Audit "${updated.label}" เรียบร้อยแล้ว`);
      setEditingAudit(null);
      void queryClient.invalidateQueries({ queryKey: ['audit-definitions'] });
      void queryClient.invalidateQueries({ queryKey: ['audits'] });
    },
  });

  const updateMenuMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { label?: string; sortOrder?: number; allowedRoles?: ('OWNER' | 'MANAGER' | 'CASHIER')[]; active?: boolean } }) =>
      updateNavigationMenu(id, data),
    onSuccess: (updated) => {
      setNotice(`บันทึกการตั้งค่าเมนู "${updated.label}" เรียบร้อยแล้ว`);
      setEditingMenu(null);
      void queryClient.invalidateQueries({ queryKey: ['manageable-menus'] });
      void queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });

  // Position & RBAC Matrix State
  const [matrixSubTab, setMatrixSubTab] = useState<'MATRIX' | 'CATALOG'>('MATRIX');
  const [isCreatingPosition, setIsCreatingPosition] = useState(false);

  const matrixQuery = useQuery({
    queryKey: ['position-matrix'],
    queryFn: () => getPositionMatrix(),
    enabled: activeTab === 'MENUS',
  });

  const positionsQuery = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions(),
    enabled: activeTab === 'MENUS',
  });

  const updatePermissionMutation = useMutation({
    mutationFn: ({ positionId, permissions }: { positionId: string; permissions: { menuId: string; canView: boolean; canExport?: boolean }[] }) =>
      updatePositionPermissions(positionId, { permissions }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['position-matrix'] });
      void queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });

  const createPositionMutation = useMutation({
    mutationFn: (data: CreatePositionInput) => createPosition(data),
    onSuccess: (newPos) => {
      setNotice(`สร้างตำแหน่งงาน "${newPos.name}" (${newPos.code}) สำเร็จ`);
      setIsCreatingPosition(false);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      void queryClient.invalidateQueries({ queryKey: ['position-matrix'] });
    },
  });

  const canEdit = profile.role === 'OWNER' || profile.role === 'MANAGER';
  const isOwner = profile.role === 'OWNER';

  // Filtered menus
  const filteredMenus = (menusQuery.data || []).filter((m) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.label.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q) ||
        m.sectionLabel.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered statuses
  const filteredStatuses = (statusesQuery.data || []).filter((s) => {
    if (domainFilter !== 'ALL' && s.domain.toUpperCase() !== domainFilter.toUpperCase()) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.label.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered audit definitions
  const filteredAudits = (auditsQuery.data || []).filter((a) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.label.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <dialog
      ref={dialogRef}
      className="modal master-data-dialog"
      style={{ maxWidth: '980px', width: '95vw', padding: 0, overflow: 'hidden' }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              จัดการสถานะและ Master Data
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              ปรับแต่งชื่อเรียกภาษาไทย, สี Badge, และระดับความสำคัญของกระบวนการในระบบ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#cbd5e1',
            borderRadius: '8px',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            padding: '10px 24px',
            background: '#ecfdf5',
            color: '#065f46',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #a7f3d0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} /> {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs & Search Bar */}
      <div
        style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('STATUSES');
              setSearch('');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'STATUSES' ? '#ffffff' : 'transparent',
              color: activeTab === 'STATUSES' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'STATUSES' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={15} />
            สถานะการทำงาน ({statusesQuery.data?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('AUDIT_ACTIONS');
              setSearch('');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'AUDIT_ACTIONS' ? '#ffffff' : 'transparent',
              color: activeTab === 'AUDIT_ACTIONS' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'AUDIT_ACTIONS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sliders size={15} />
            คำจำกัดความ Audit ({auditsQuery.data?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('MENUS');
              setSearch('');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: activeTab === 'MENUS' ? '#ffffff' : 'transparent',
              color: activeTab === 'MENUS' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'MENUS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Menu size={15} />
            เมนูระบบ & สิทธิ์ RBAC ({menusQuery.data?.length || 0})
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, รหัส, คำอธิบาย..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '9px',
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
      </div>

      {/* Sub-Filter for Statuses Tab */}
      {activeTab === 'STATUSES' && (
        <div
          style={{
            padding: '10px 24px',
            background: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
          }}
        >
          {Object.entries(DOMAIN_LABELS).map(([domain, label]) => {
            const isSelected = domainFilter === domain;
            return (
              <button
                key={domain}
                type="button"
                onClick={() => setDomainFilter(domain)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  border: isSelected ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  background: isSelected ? '#e0f2fe' : '#ffffff',
                  color: isSelected ? '#0369a1' : '#64748b',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Body Area */}
      <div style={{ maxHeight: 'calc(80vh - 200px)', overflowY: 'auto', padding: '20px 24px' }}>
        {activeTab === 'STATUSES' ? (
          <div>
            {statusesQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>กำลังโหลดข้อมูลสถานะ...</div>
            ) : filteredStatuses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>ไม่พบรายการสถานะที่ค้นหา</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {filteredStatuses.map((item) => (
                  <div
                    key={`${item.domain}-${item.code}`}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px',
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            color: '#64748b',
                            background: '#f1f5f9',
                            padding: '2px 7px',
                            borderRadius: '5px',
                          }}
                        >
                          {DOMAIN_LABELS[item.domain] || item.domain}
                        </span>
                        <code style={{ fontSize: '11px', color: '#0284c7', background: '#f0f9ff', padding: '1px 5px', borderRadius: '4px' }}>
                          {item.code}
                        </code>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                        <DynamicStatusBadge domain={item.domain} code={item.code} fallbackLabel={item.label} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.label}</span>
                      </div>

                      {item.description && (
                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid #f1f5f9',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.color && (
                          <span
                            title={`สี: ${item.color}`}
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              backgroundColor: item.color,
                              display: 'inline-block',
                              border: '1px solid rgba(0,0,0,0.1)',
                            }}
                          />
                        )}
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          ลำดับ: {item.sortOrder} {item.isTerminal && '· สิ้นสุด'}
                        </span>
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingStatus(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#0284c7',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                          แก้ไข
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'AUDIT_ACTIONS' ? (
          /* AUDIT ACTIONS TAB */
          <div>
            {auditsQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>กำลังโหลดคำจำกัดความ Audit...</div>
            ) : filteredAudits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>ไม่พบรายการ Action ที่ค้นหา</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {filteredAudits.map((item) => (
                  <div
                    key={item.action}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px',
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            color: '#64748b',
                            background: '#f1f5f9',
                            padding: '2px 7px',
                            borderRadius: '5px',
                          }}
                        >
                          {item.category}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            color:
                              item.severity === 'CRITICAL'
                                ? '#be123c'
                                : item.severity === 'WARNING'
                                ? '#b45309'
                                : '#047857',
                            background:
                              item.severity === 'CRITICAL'
                                ? '#ffe4e6'
                                : item.severity === 'WARNING'
                                ? '#fef3c7'
                                : '#d1fae5',
                          }}
                        >
                          {item.severity}
                        </span>
                      </div>

                      <h4 style={{ margin: '8px 0 4px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                        {item.label}
                      </h4>
                      <code style={{ fontSize: '11px', color: '#0284c7' }}>{item.action}</code>

                      {item.description && (
                        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid #f1f5f9',
                      }}
                    >
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingAudit(item)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#0284c7',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                          แก้ไข
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* MENUS & RBAC TAB */
          <div>
            {/* Sub-tab Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setMatrixSubTab('MATRIX')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: matrixSubTab === 'MATRIX' ? '#ffffff' : 'transparent',
                    color: matrixSubTab === 'MATRIX' ? '#0284c7' : '#64748b',
                    boxShadow: matrixSubTab === 'MATRIX' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Shield size={14} />
                  ตารางสิทธิ์ตามตำแหน่ง (RBAC Matrix)
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixSubTab('CATALOG')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: matrixSubTab === 'CATALOG' ? '#ffffff' : 'transparent',
                    color: matrixSubTab === 'CATALOG' ? '#0284c7' : '#64748b',
                    boxShadow: matrixSubTab === 'CATALOG' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Layers size={14} />
                  แคตตาล็อกเมนูระบบ ({filteredMenus.length})
                </button>
              </div>

              {matrixSubTab === 'MATRIX' && isOwner && (
                <button
                  type="button"
                  onClick={() => setIsCreatingPosition(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  เพิ่มตำแหน่งงานใหม่
                </button>
              )}
            </div>

            {matrixSubTab === 'MATRIX' ? (
              /* ── RBAC Matrix View ── */
              <div>
                {matrixQuery.isLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>กำลังโหลดตารางสิทธิ์ Matrix...</div>
                ) : !matrixQuery.data ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>ไม่พบข้อมูล Matrix</div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        คลิกที่เครื่องหมายถูกในแต่ละช่องเพื่อเปิด/ปิดสิทธิ์การเข้าถึงเมนูของตำแหน่งงานนั้น ๆ (บันทึกอัตโนมัติลงฐานข้อมูล)
                      </span>
                      <span style={{ fontSize: '11px', color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {matrixQuery.data.positions.length} ตำแหน่งงาน · {matrixQuery.data.menus.length} เมนู
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 700, color: '#334155', minWidth: '220px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>
                              เมนูระบบ
                            </th>
                            {matrixQuery.data.positions.map((pos) => (
                              <th key={pos.id} style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center', minWidth: '130px', color: '#1e293b' }}>
                                <div style={{ fontSize: '13px' }}>{pos.name}</div>
                                <code style={{ fontSize: '10px', color: pos.isSystem ? '#7c3aed' : '#0284c7' }}>
                                  {pos.code} {pos.isSystem ? '• ระบบ' : ''}
                                </code>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixQuery.data.menus.map((menu, idx) => {
                            const isNewSection = idx === 0 || matrixQuery.data!.menus[idx - 1].section !== menu.section;
                            return (
                              <React.Fragment key={menu.id}>
                                {isNewSection && (
                                  <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                    <td
                                      colSpan={matrixQuery.data!.positions.length + 1}
                                      style={{
                                        padding: '8px 16px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        letterSpacing: '0.04em',
                                        color: '#0369a1',
                                      }}
                                    >
                                      📁 หมวดหมู่: {menu.sectionLabel} ({menu.section})
                                    </td>
                                  </tr>
                                )}
                                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px 16px', position: 'sticky', left: 0, background: '#ffffff', zIndex: 1, borderRight: '1px solid #f1f5f9' }}>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{menu.label}</div>
                                    <code style={{ fontSize: '10px', color: '#64748b' }}>key: {menu.key}</code>
                                  </td>
                                  {matrixQuery.data!.positions.map((pos) => {
                                    const isOwnerPos = pos.code === 'OWNER';
                                    const currentCanView = isOwnerPos ? true : Boolean(matrixQuery.data!.matrix[pos.id]?.[menu.id]?.canView);
                                    return (
                                      <td key={pos.id} style={{ padding: '8px 12px', textAlign: 'center' }}>
                                        <button
                                          type="button"
                                          disabled={!isOwner || isOwnerPos || updatePermissionMutation.isPending}
                                          onClick={() => {
                                            updatePermissionMutation.mutate({
                                              positionId: pos.id,
                                              permissions: [{ menuId: menu.id, canView: !currentCanView }],
                                            });
                                          }}
                                          title={isOwnerPos ? 'เจ้าของร้านมีสิทธิ์เข้าถึงทุกเมนู' : isOwner ? `คลิกเพื่อ${currentCanView ? 'ปิด' : 'เปิด'}สิทธิ์` : 'เฉพาะเจ้าของร้านที่แก้ไขได้'}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            border: currentCanView ? '1.5px solid #22c55e' : '1px solid #cbd5e1',
                                            background: currentCanView ? '#dcfce7' : '#f8fafc',
                                            color: currentCanView ? '#15803d' : '#94a3b8',
                                            cursor: isOwner && !isOwnerPos ? 'pointer' : 'default',
                                            transition: 'all 0.15s ease',
                                          }}
                                        >
                                          {currentCanView ? <Check size={16} strokeWidth={3} /> : <X size={14} />}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Menu Catalog View ── */
              <div>
                {menusQuery.isLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>กำลังโหลดเมนูระบบ...</div>
                ) : filteredMenus.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>ไม่พบเมนูที่ค้นหา</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                    {filteredMenus.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '14px',
                          background: item.active ? '#ffffff' : '#f8fafc',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          opacity: item.active ? 1 : 0.65,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: '#e0f2fe',
                                color: '#0369a1',
                              }}
                            >
                              {item.sectionLabel}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>ลำดับ: #{item.sortOrder}</span>
                              {isOwner && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateMenuMutation.mutate({
                                      id: item.id,
                                      data: { active: !item.active },
                                    });
                                  }}
                                  title={item.active ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    background: item.active ? '#dcfce7' : '#f1f5f9',
                                    color: item.active ? '#15803d' : '#64748b',
                                  }}
                                >
                                  {item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 4px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                              {item.label}
                            </h4>
                          </div>
                          <code style={{ fontSize: '11px', color: '#0284c7' }}>key: {item.key} · icon: {item.icon}</code>

                          {/* Role Badges */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
                            <span style={{ fontSize: '11px', color: '#475569', alignSelf: 'center', marginRight: '4px' }}>สิทธิ์:</span>
                            {item.allowedRoles.map((role) => (
                              <span
                                key={role}
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background:
                                    role === 'OWNER'
                                      ? '#ede9fe'
                                      : role === 'MANAGER'
                                      ? '#e0f2fe'
                                      : '#ecfdf5',
                                  color:
                                    role === 'OWNER'
                                      ? '#6b21a8'
                                      : role === 'MANAGER'
                                      ? '#0369a1'
                                      : '#047857',
                                }}
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            marginTop: '12px',
                            paddingTop: '10px',
                            borderTop: '1px solid #f1f5f9',
                          }}
                        >
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => setEditingMenu(item)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#0284c7',
                                background: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <Edit2 size={13} />
                              แก้ไขสิทธิ์ / ชื่อ
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status Edit Modal ── */}
      {editingStatus && (
        <EditStatusModal
          status={editingStatus}
          isPending={updateStatusMutation.isPending}
          onClose={() => setEditingStatus(null)}
          onSave={(data) => {
            updateStatusMutation.mutate({
              domain: editingStatus.domain,
              code: editingStatus.code,
              data,
            });
          }}
        />
      )}

      {/* ── Audit Action Edit Modal ── */}
      {editingAudit && (
        <EditAuditModal
          audit={editingAudit}
          isPending={updateAuditMutation.isPending}
          onClose={() => setEditingAudit(null)}
          onSave={(data) => {
            updateAuditMutation.mutate({
              action: editingAudit.action,
              data,
            });
          }}
        />
      )}

      {/* ── Navigation Menu Edit Modal ── */}
      {editingMenu && (
        <EditMenuModal
          menu={editingMenu}
          isPending={updateMenuMutation.isPending}
          onClose={() => setEditingMenu(null)}
          onSave={(data) => {
            updateMenuMutation.mutate({
              id: editingMenu.id,
              data,
            });
          }}
        />
      )}

      {/* ── Create Position Modal ── */}
      {isCreatingPosition && (
        <CreatePositionModal
          isPending={createPositionMutation.isPending}
          onClose={() => setIsCreatingPosition(false)}
          onSave={(data) => createPositionMutation.mutate(data)}
        />
      )}
    </dialog>
  );
}

// ── Edit Status Sub-Modal ──
function EditStatusModal({
  status,
  isPending,
  onClose,
  onSave,
}: {
  status: SystemStatusDefinition;
  isPending: boolean;
  onClose: () => void;
  onSave: (data: UpdateSystemStatusInput) => void;
}) {
  const [label, setLabel] = useState(status.label);
  const [color, setColor] = useState(status.color || '#16825d');
  const [bgColor, setBgColor] = useState(status.bgColor || '#e8f5ed');
  const [icon, setIcon] = useState(status.icon || 'CheckCircle2');
  const [sortOrder, setSortOrder] = useState(status.sortOrder || 1);
  const [isTerminal, setIsTerminal] = useState(status.isTerminal || false);
  const [description, setDescription] = useState(status.description || '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      label: label.trim(),
      color,
      bgColor,
      icon,
      sortOrder: Number(sortOrder),
      isTerminal,
      description: description.trim() || null,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              แก้ไขสถานะ: {status.code}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>หมวดหมู่: {status.domain}</span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px' }}>
          {/* Live Preview */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
              ตัวอย่าง Badge ที่จะแสดงในระบบ
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '999px',
                padding: '4px 12px',
                color,
                background: bgColor,
                border: `1px solid ${color}30`,
              }}
            >
              {label || 'ตัวอย่าง'}
            </span>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              ชื่อเรียกภาษาไทย (Label) *
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          {/* Color Presets */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              โทนสีสำเร็จรูป (Color Presets)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.color}
                  type="button"
                  onClick={() => {
                    setColor(p.color);
                    setBgColor(p.bg);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: color === p.color ? '2px solid #0f172a' : '1px solid #e2e8f0',
                    background: p.bg,
                    color: p.color,
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Icon & Sort Order */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                ไอคอน
              </label>
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                {ICONS_LIST.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                ลำดับการแสดงผล (Sort Order)
              </label>
              <input
                type="number"
                min="0"
                max="999"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              คำอธิบายเพิ่มเติม
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุวัตถุประสงค์หรือความหมายของสถานะ"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isTerminal}
                onChange={(e) => setIsTerminal(e.target.checked)}
              />
              เป็นสถานะสิ้นสุดของกระบวนการ (Terminal State) เช่น เสร็จสิ้น หรือ ยกเลิก
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="secondary" onClick={onClose} disabled={isPending}>
              ยกเลิก
            </button>
            <button type="submit" className="primary" disabled={isPending}>
              {isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Audit Sub-Modal ──
function EditAuditModal({
  audit,
  isPending,
  onClose,
  onSave,
}: {
  audit: AuditActionDefinition;
  isPending: boolean;
  onClose: () => void;
  onSave: (data: UpdateAuditActionDefinitionInput) => void;
}) {
  const [label, setLabel] = useState(audit.label);
  const [category, setCategory] = useState(audit.category);
  const [severity, setSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>(audit.severity);
  const [description, setDescription] = useState(audit.description || '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      label: label.trim(),
      category: category.trim(),
      severity,
      description: description.trim() || null,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              แก้ไข Audit Action
            </h3>
            <code style={{ fontSize: '12px', color: '#0284c7' }}>{audit.action}</code>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              ชื่อเรียกภาษาไทย (Action Label) *
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                หมวดหมู่ (Category) *
              </label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                ระดับความสำคัญ (Severity)
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              >
                <option value="INFO">INFO (ทั่วไป)</option>
                <option value="WARNING">WARNING (สำคัญ/ปรับยอด)</option>
                <option value="CRITICAL">CRITICAL (วิกฤต/ยกเลิก)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              คำอธิบายการกระทำ (Description)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุสิ่งที่เกิดขึ้นเมื่อมี Action นี้"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="secondary" onClick={onClose} disabled={isPending}>
              ยกเลิก
            </button>
            <button type="submit" className="primary" disabled={isPending}>
              {isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Navigation Menu Sub-Modal ──
function EditMenuModal({
  menu,
  isPending,
  onClose,
  onSave,
}: {
  menu: NavigationMenuItem;
  isPending: boolean;
  onClose: () => void;
  onSave: (data: UpdateNavigationMenuInput) => void;
}) {
  const [label, setLabel] = useState(menu.label);
  const [icon, setIcon] = useState(menu.icon);
  const [sortOrder, setSortOrder] = useState(menu.sortOrder);
  const [active, setActive] = useState(menu.active);
  const [allowedRoles, setAllowedRoles] = useState<('OWNER' | 'MANAGER' | 'CASHIER')[]>(
    menu.allowedRoles
  );

  const ALL_ROLES: ('OWNER' | 'MANAGER' | 'CASHIER')[] = ['OWNER', 'MANAGER', 'CASHIER'];

  function toggleRole(role: 'OWNER' | 'MANAGER' | 'CASHIER') {
    if (allowedRoles.includes(role)) {
      if (allowedRoles.length === 1) return;
      setAllowedRoles(allowedRoles.filter((r) => r !== role));
    } else {
      setAllowedRoles([...allowedRoles, role]);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!allowedRoles.length) return;
    onSave({
      label: label.trim(),
      icon: icon.trim(),
      sortOrder: Number(sortOrder),
      active,
      allowedRoles,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              แก้ไขเมนู: {menu.label}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              หมวดหมู่: {menu.sectionLabel} ({menu.section}) · Key: <code style={{ color: '#0284c7' }}>{menu.key}</code>
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              ชื่อเมนู (Display Label) *
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                ชื่อไอคอน (Lucide Icon) *
              </label>
              <input
                type="text"
                required
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                ลำดับการแสดงผล (Sort Order)
              </label>
              <input
                type="number"
                min="0"
                max="999"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              สิทธิ์การเข้าถึง (Allowed Roles) *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {ALL_ROLES.map((role) => {
                const checked = allowedRoles.includes(role);
                return (
                  <label
                    key={role}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: checked ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                      background: checked ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: checked ? '#1d4ed8' : '#64748b',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role)}
                    />
                    {role}
                  </label>
                );
              })}
            </div>
            {allowedRoles.length === 0 && (
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#dc2626' }}>
                * กรุณาเลือกสิทธิ์อย่างน้อย 1 บทบาท
              </p>
            )}
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              เปิดใช้งานเมนูนี้ในระบบ (Active)
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="secondary" onClick={onClose} disabled={isPending}>
              ยกเลิก
            </button>
            <button type="submit" className="primary" disabled={isPending || allowedRoles.length === 0}>
              {isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create Position Sub-Modal ──
function CreatePositionModal({
  isPending,
  onClose,
  onSave,
}: {
  isPending: boolean;
  onClose: () => void;
  onSave: (data: CreatePositionInput) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim() || null,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              เพิ่มตำแหน่งงานใหม่ (New Position)
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              สร้างตำแหน่งงานเพื่อกำหนดสิทธิ์การเข้าถึงเมนูในตาราง RBAC Matrix
            </span>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              รหัสตำแหน่ง (Position Code) *
            </label>
            <input
              type="text"
              required
              placeholder="เช่น SUPERVISOR, BARISTA, DRIVER"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>ตัวพิมพ์ใหญ่ A-Z, 0-9 และ _ เท่านั้น</span>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              ชื่อตำแหน่งงานภาษาไทย (Display Name) *
            </label>
            <input
              type="text"
              required
              placeholder="เช่น หัวหน้ากะ / บาริสต้าประจำร้าน"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
              คำอธิบายหน้าที่ / รายละเอียด
            </label>
            <textarea
              rows={3}
              placeholder="ระบุความรับผิดชอบหรือหน้าที่ของตำแหน่งนี้"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="secondary" onClick={onClose} disabled={isPending}>
              ยกเลิก
            </button>
            <button type="submit" className="primary" disabled={isPending || !code.trim() || !name.trim()}>
              {isPending ? 'กำลังสร้าง...' : 'สร้างตำแหน่งงาน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
