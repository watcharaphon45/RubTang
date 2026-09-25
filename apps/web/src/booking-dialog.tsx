import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Scissors,
  Sparkles,
  Tag,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
  CreditCard,
  AlertCircle,
  Armchair,
  CheckCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Branch,
  Profile,
  BookingAppointmentItem,
  BookingAppointmentStatus,
  ServiceCatalogItem,
  BookingResourceItem,
  BookingStaffItem,
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  getServices,
  createService,
  updateService,
  getBookingResources,
  createBookingResource,
  getBookingStaff,
  getBookingAvailability,
} from './api';
import { AppSelect } from './components/app-select';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

interface BookingDialogProps {
  branch: Branch;
  profile: Profile;
  onClose: () => void;
  onCheckoutAppointment?: (appointment: BookingAppointmentItem) => void;
}

export function BookingDialog({
  branch,
  profile,
  onClose,
  onCheckoutAppointment,
}: BookingDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'schedule' | 'services' | 'resources' | 'staff'>('schedule');

  // Schedule Tab State
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // New Appointment Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustNote, setNewCustNote] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newStaffId, setNewStaffId] = useState('');
  const [newResourceId, setNewResourceId] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');

  // New Service Form State
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcCategory, setNewSvcCategory] = useState('ตัดผมและออกแบบทรง');
  const [newSvcDuration, setNewSvcDuration] = useState(45);
  const [newSvcBuffer, setNewSvcBuffer] = useState(10);
  const [newSvcPrice, setNewSvcPrice] = useState(350);
  const [newSvcDesc, setNewSvcDesc] = useState('');

  // New Resource Form State
  const [newResName, setNewResName] = useState('');
  const [newResType, setNewResType] = useState<'CHAIR' | 'ROOM' | 'STATION' | 'TABLE'>('CHAIR');
  const [newResDesc, setNewResDesc] = useState('');

  // Edit Service State
  const [editingService, setEditingService] = useState<ServiceCatalogItem | null>(null);
  const [editSvcName, setEditSvcName] = useState('');
  const [editSvcCategory, setEditSvcCategory] = useState('');
  const [editSvcDuration, setEditSvcDuration] = useState(45);
  const [editSvcBuffer, setEditSvcBuffer] = useState(10);
  const [editSvcPrice, setEditSvcPrice] = useState(350);
  const [editSvcDesc, setEditSvcDesc] = useState('');
  const [editSvcActive, setEditSvcActive] = useState(true);

  // Fetch Appointments
  const { data: appointments = [], isLoading: isLoadingAppointments, refetch: refetchAppointments } = useQuery({
    queryKey: ['booking-appointments', branch.id, selectedDate],
    queryFn: () => getAppointments({ branchId: branch.id, date: selectedDate }),
    refetchInterval: 12_000,
  });

  // Fetch Services
  const { data: services = [], refetch: refetchServices } = useQuery({
    queryKey: ['booking-services', branch.id],
    queryFn: () => getServices(branch.id),
  });

  // Fetch Resources (Chairs / Stations)
  const { data: resources = [], refetch: refetchResources } = useQuery({
    queryKey: ['booking-resources', branch.id],
    queryFn: () => getBookingResources(branch.id),
  });

  // Fetch Staff Stylists
  const { data: staffList = [] } = useQuery({
    queryKey: ['booking-staff', branch.id],
    queryFn: () => getBookingStaff(branch.id),
  });

  // Fetch available slots when creating appointment
  const { data: availabilityData } = useQuery({
    queryKey: ['booking-avail', branch.id, newServiceId, selectedDate, newStaffId],
    queryFn: () => getBookingAvailability(branch.id, newServiceId, selectedDate, newStaffId || undefined),
    enabled: Boolean(showAddAppModal && newServiceId && selectedDate),
  });

  // Default first service if opening modal
  useEffect(() => {
    if (showAddAppModal && services.length > 0 && !newServiceId) {
      setNewServiceId(services[0].id);
    }
  }, [showAddAppModal, services, newServiceId]);

  // Generate QR Code for public booking link
  const publicBookingUrl = `${window.location.origin}/?book=${branch.id}`;
  useEffect(() => {
    if (!showQrModal) return;
    QRCode.toString(publicBookingUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0b2347', light: '#ffffff' },
      width: 260,
    })
      .then(svg => setQrSvg(svg))
      .catch(err => console.error('Failed to generate booking QR:', err));
  }, [showQrModal, publicBookingUrl]);

  // Date controls
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  // Status transitions
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingAppointmentStatus }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-appointments'] });
    },
  });

  // Create Appointment Mutation
  const createAppointmentMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-appointments'] });
      setShowAddAppModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustNote('');
      setNewTimeSlot('');
    },
  });

  // Create Service Mutation
  const createServiceMutation = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-services'] });
      setShowAddServiceModal(false);
      setNewSvcName('');
      setNewSvcDesc('');
    },
  });

  // Update Service Mutation
  const updateServiceMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateService>[1] }) =>
      updateService(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-services'] });
      setEditingService(null);
    },
  });

  const handleOpenEditService = (svc: ServiceCatalogItem) => {
    setEditingService(svc);
    setEditSvcName(svc.name);
    setEditSvcCategory(svc.category || 'ทั่วไป');
    setEditSvcDuration(svc.durationMinutes);
    setEditSvcBuffer(svc.bufferMinutes || 0);
    setEditSvcPrice(Number(svc.price));
    setEditSvcDesc(svc.description || '');
    setEditSvcActive(svc.active);
  };

  // Create Resource Mutation
  const createResourceMutation = useMutation({
    mutationFn: createBookingResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-resources'] });
      setShowAddResourceModal(false);
      setNewResName('');
      setNewResDesc('');
    },
  });

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    let list = [...appointments];
    if (statusFilter !== 'ALL') {
      list = list.filter(a => a.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        a =>
          a.customerName.toLowerCase().includes(q) ||
          a.customerPhone.includes(q) ||
          a.bookingCode.toLowerCase().includes(q) ||
          a.service.name.toLowerCase().includes(q) ||
          (a.staff?.user.displayName && a.staff.user.displayName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [appointments, statusFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const total = appointments.length;
    const confirmed = appointments.filter(a => a.status === 'CONFIRMED').length;
    const inService = appointments.filter(a => a.status === 'IN_SERVICE').length;
    const completed = appointments.filter(a => a.status === 'COMPLETED').length;
    const cancelled = appointments.filter(a => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length;
    return { total, confirmed, inService, completed, cancelled };
  }, [appointments]);

  const copyBookingLink = () => {
    navigator.clipboard.writeText(publicBookingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const getStatusBadge = (status: BookingAppointmentStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return <span className="pill" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}><CheckCircle2 size={13} style={{ marginRight: 4 }} />ยืนยันแล้ว</span>;
      case 'IN_SERVICE':
        return <span className="pill" style={{ background: '#fef3c7', color: '#b45309', borderColor: '#fde68a' }}><Flame size={13} style={{ marginRight: 4 }} />กำลังรับบริการ</span>;
      case 'COMPLETED':
        return <span className="pill" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }}><Check size={13} style={{ marginRight: 4 }} />เสร็จสิ้น</span>;
      case 'PENDING':
        return <span className="pill" style={{ background: '#f1f5f9', color: '#475569' }}><Clock size={13} style={{ marginRight: 4 }} />รอยืนยัน</span>;
      case 'CANCELLED':
        return <span className="pill" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}>ยกเลิก</span>;
      case 'NO_SHOW':
        return <span className="pill" style={{ background: '#f3f4f6', color: '#6b7280' }}>ไม่มาตามนัด</span>;
      default:
        return <span className="pill">{status}</span>;
    }
  };

  return (
    <dialog open className="modal modal-lg" style={{ maxWidth: 1100, width: '95vw', padding: 0, overflow: 'hidden' }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
          }}>
            <Scissors size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                คิวนัดหมาย & จองบริการ
              </h2>
              <span className="pill" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                {branch.name}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              ระบบบริหารจัดการคิวนัดช่างตัดผม ซาลอน และบริการสปา พร้อมส่งคิดเงินหน้าร้าน POS
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href={publicBookingUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', textDecoration: 'none' }}
          >
            <ExternalLink size={16} />
            <span>หน้าจองลูกค้า</span>
          </a>

          <button
            type="button"
            className="secondary"
            onClick={() => setShowQrModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          >
            <QrCode size={16} />
            <span>QR จองหน้าร้าน</span>
          </button>

          <button
            type="button"
            className="primary"
            onClick={() => setShowAddAppModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            <span>เพิ่มคิวนัดหมาย</span>
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            style={{ marginLeft: 6 }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        borderBottom: '1px solid #e2e8f0',
        background: '#fff',
        gap: 20,
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          style={{
            padding: '12px 4px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: activeTab === 'schedule' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'schedule' ? '2px solid #0284c7' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CalendarDays size={17} />
          <span>ตารางคิว & นัดหมายวันนี้</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('services')}
          style={{
            padding: '12px 4px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: activeTab === 'services' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'services' ? '2px solid #0284c7' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Scissors size={17} />
          <span>บริการ & แคตตาล็อก ({services.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('resources')}
          style={{
            padding: '12px 4px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: activeTab === 'resources' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'resources' ? '2px solid #0284c7' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Armchair size={17} />
          <span>เก้าอี้ & ห้องบริการ ({resources.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          style={{
            padding: '12px 4px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: activeTab === 'staff' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'staff' ? '2px solid #0284c7' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <UserCheck size={17} />
          <span>ช่างประจำร้าน ({staffList.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ height: 'calc(80vh - 120px)', overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>
        {activeTab === 'schedule' && (
          <div>
            {/* Date Navigator & Filters Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
              background: '#fff',
              padding: '12px 18px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}>
              {/* Date Control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handlePrevDay}
                  title="วันก่อนหน้า"
                  style={{ width: 34, height: 34 }}
                >
                  <ChevronLeft size={18} />
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                />

                <button
                  type="button"
                  className="icon-button"
                  onClick={handleNextDay}
                  title="วันถัดไป"
                  style={{ width: 34, height: 34 }}
                >
                  <ChevronRight size={18} />
                </button>

                <button
                  type="button"
                  className="secondary"
                  onClick={handleToday}
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                >
                  วันนี้
                </button>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => refetchAppointments()}
                  title="รีเฟรชคิว"
                  style={{ width: 34, height: 34 }}
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* Status Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`pill ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                  style={{
                    cursor: 'pointer',
                    background: statusFilter === 'ALL' ? '#0284c7' : '#f1f5f9',
                    color: statusFilter === 'ALL' ? '#fff' : '#475569',
                    border: 'none',
                    fontWeight: 600,
                    padding: '6px 12px',
                  }}
                >
                  ทั้งหมด ({metrics.total})
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setStatusFilter('CONFIRMED')}
                  style={{
                    cursor: 'pointer',
                    background: statusFilter === 'CONFIRMED' ? '#0284c7' : '#f1f5f9',
                    color: statusFilter === 'CONFIRMED' ? '#fff' : '#475569',
                    border: 'none',
                    fontWeight: 600,
                    padding: '6px 12px',
                  }}
                >
                  ยืนยันแล้ว ({metrics.confirmed})
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setStatusFilter('IN_SERVICE')}
                  style={{
                    cursor: 'pointer',
                    background: statusFilter === 'IN_SERVICE' ? '#b45309' : '#f1f5f9',
                    color: statusFilter === 'IN_SERVICE' ? '#fff' : '#475569',
                    border: 'none',
                    fontWeight: 600,
                    padding: '6px 12px',
                  }}
                >
                  กำลังทำ ({metrics.inService})
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setStatusFilter('COMPLETED')}
                  style={{
                    cursor: 'pointer',
                    background: statusFilter === 'COMPLETED' ? '#15803d' : '#f1f5f9',
                    color: statusFilter === 'COMPLETED' ? '#fff' : '#475569',
                    border: 'none',
                    fontWeight: 600,
                    padding: '6px 12px',
                  }}
                >
                  เสร็จแล้ว ({metrics.completed})
                </button>
              </div>

              {/* Search box */}
              <div style={{ position: 'relative', width: 220 }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ/เบอร์..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: 32,
                    paddingRight: 10,
                    paddingTop: 6,
                    paddingBottom: 6,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            {/* Schedule Cards List */}
            {isLoadingAppointments ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                กำลังโหลดรายการคิวนัดหมาย…
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                background: '#fff',
                borderRadius: 14,
                border: '1px dashed #cbd5e1',
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: '#94a3b8',
                }}>
                  <CalendarDays size={28} />
                </div>
                <h3 style={{ margin: '0 0 6px', color: '#334155' }}>ไม่พบคิวนัดหมายในวันนี้</h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem' }}>
                  ยังไม่มีลูกค้าจองคิวในวันที่ {selectedDate} คุณสามารถกดปุ่ม "เพิ่มคิวนัดหมาย" เพื่อลงคิว Walk-in ได้ทันที
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAddAppModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} />
                  <span>เพิ่มคิวใหม่</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredAppointments.map(app => (
                  <div
                    key={app.id}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      borderLeft: app.status === 'IN_SERVICE' ? '4px solid #f59e0b' : app.status === 'CONFIRMED' ? '4px solid #0284c7' : '4px solid #cbd5e1',
                    }}
                  >
                    {/* Time & Code */}
                    <div style={{ minWidth: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Clock size={16} style={{ color: '#0284c7' }} />
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                          {app.startTime} - {app.endTime}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#475569' }}>
                          {app.bookingCode}
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                        {app.customerName}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>โทร: {app.customerPhone}</span>
                        {app.customerNote && (
                          <span style={{ color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
                            หมายเหตุ: {app.customerNote}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Service & Price */}
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0284c7' }}>
                        {app.service.name}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {app.service.durationMinutes} นาที · <strong>{money.format(Number(app.service.price))}</strong>
                      </div>
                    </div>

                    {/* Staff & Resource */}
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <User size={14} style={{ color: '#0284c7' }} />
                        <span>{app.staff?.user.displayName || 'ช่างประจำร้าน (เวียนคิว)'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <Armchair size={14} />
                        <span>{app.resource?.name || 'เก้าอี้ตัดผมมาตรฐาน'}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {app.status === 'CONFIRMED' && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => updateStatusMutation.mutate({ id: app.id, status: 'IN_SERVICE' })}
                          style={{
                            background: '#0284c7',
                            borderColor: '#0284c7',
                            fontSize: '0.85rem',
                            padding: '8px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Flame size={15} />
                          <span>เริ่มบริการ</span>
                        </button>
                      )}

                      {app.status === 'IN_SERVICE' && (
                        <>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              if (onCheckoutAppointment) {
                                onCheckoutAppointment(app);
                              } else {
                                updateStatusMutation.mutate({ id: app.id, status: 'COMPLETED' });
                              }
                            }}
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              fontSize: '0.85rem',
                              padding: '8px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <CreditCard size={15} />
                            <span>คิดเงินที่ POS</span>
                          </button>

                          <button
                            type="button"
                            className="secondary"
                            onClick={() => updateStatusMutation.mutate({ id: app.id, status: 'COMPLETED' })}
                            style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                            title="เสร็จสิ้นบริการโดยไม่ผ่าน POS"
                          >
                            <Check size={15} />
                            <span>เสร็จสิ้น</span>
                          </button>
                        </>
                      )}

                      {app.status === 'COMPLETED' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>
                          <CheckCircle2 size={16} />
                          <span>เสร็จสมบูรณ์</span>
                        </div>
                      )}

                      {['CONFIRMED', 'PENDING'].includes(app.status) && (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => {
                            if (window.confirm(`ต้องการยกเลิกคิวของคุณ ${app.customerName} ใช่หรือไม่?`)) {
                              updateStatusMutation.mutate({ id: app.id, status: 'CANCELLED' });
                            }
                          }}
                          title="ยกเลิกนัดหมาย"
                          style={{ color: '#ef4444' }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>รายการบริการ & อัตราค่าบริการ</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  กำหนดรายการบริการ ระยะเวลาการตัดผม/ทำเคมี และราคาสำหรับการจองออนไลน์และหน้าร้าน
                </p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setShowAddServiceModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={16} />
                <span>เพิ่มบริการใหม่</span>
              </button>
            </div>

            <div className="table-scroll" style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <table>
                <thead>
                  <tr>
                    <th>ชื่อบริการ</th>
                    <th>หมวดหมู่</th>
                    <th className="numeric">ระยะเวลา</th>
                    <th className="numeric">เวลาพัก (Buffer)</th>
                    <th className="numeric">ราคา</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map(svc => (
                    <tr key={svc.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{svc.name}</div>
                        {svc.description && <small className="muted">{svc.description}</small>}
                      </td>
                      <td>
                        <span className="pill" style={{ background: '#f1f5f9' }}>{svc.category || 'ทั่วไป'}</span>
                      </td>
                      <td className="numeric">{svc.durationMinutes} นาที</td>
                      <td className="numeric">{svc.bufferMinutes || 0} นาที</td>
                      <td className="numeric" style={{ fontWeight: 700, color: '#0284c7' }}>
                        {money.format(Number(svc.price))}
                      </td>
                      <td>
                        <span className={`status ${svc.active ? '' : 'inactive'}`}>
                          {svc.active ? 'เปิดให้บริการ' : 'ระงับชั่วคราว'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => handleOpenEditService(svc)}
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            style={{ color: svc.active ? '#ef4444' : '#16a34a' }}
                            onClick={() => updateServiceMutation.mutate({ id: svc.id, input: { active: !svc.active } })}
                          >
                            {svc.active ? 'ระงับ' : 'เปิดใช้'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'resources' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>เก้าอี้ & ห้องทำบริการ</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  จัดการสถานีตัดผม เก้าอี้บาร์เบอร์ เตียงสระ และห้องทรีทเมนต์ประจำสาขา
                </p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setShowAddResourceModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={16} />
                <span>เพิ่มเก้าอี้ / สเตชัน</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {resources.map(res => (
                <div
                  key={res.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#e0f2fe',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Armchair size={20} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{res.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>ประเภท: {res.type}</div>
                    </div>
                  </div>
                  {res.description && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#475569' }}>
                      {res.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>รายชื่อช่างประจำสาขา</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                ช่างผู้ให้บริการที่ลูกค้าสามารถเลือกจองคิวออนไลน์ได้
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {staffList.map(st => (
                <div
                  key={st.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: '#f1f5f9',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                  }}>
                    {st.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{st.displayName}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: 600 }}>
                      {st.position || 'ช่างประจำร้าน'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Customer Public QR Link */}
      {showQrModal && (
        <dialog open className="modal" style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>QR Code จองคิวออนไลน์</h3>
            <button type="button" className="icon-button" onClick={() => setShowQrModal(false)}>
              <X size={18} />
            </button>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b' }}>
            ให้ลูกค้าสแกนเพื่อเลือกบริการ นัดหมายช่าง และเลือกรอบเวลาที่สะดวกได้ด้วยตนเอง
          </p>

          <div
            style={{
              padding: 16,
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              display: 'inline-block',
              margin: '0 auto 16px',
            }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              readOnly
              value={publicBookingUrl}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                textAlign: 'center',
                color: '#475569',
                background: '#f8fafc',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="secondary"
              onClick={copyBookingLink}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {copiedLink ? <Check size={16} style={{ color: '#16a34a' }} /> : <Copy size={16} />}
              <span>{copiedLink ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}</span>
            </button>

            <a
              href={publicBookingUrl}
              target="_blank"
              rel="noreferrer"
              className="primary"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={16} />
              <span>เปิดดูหน้าจอง</span>
            </a>
          </div>
        </dialog>
      )}

      {/* Modal: Add New Appointment (In-store / Walk-in) */}
      {showAddAppModal && (
        <dialog open className="modal" style={{ maxWidth: 500, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>ลงคิวนัดหมายใหม่</h3>
            <button type="button" className="icon-button" onClick={() => setShowAddAppModal(false)}>
              <X size={18} />
            </button>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              if (!newCustName || !newCustPhone || !newServiceId || !newTimeSlot) {
                alert('กรุณากรอกข้อมูลให้ครบถ้วน');
                return;
              }
              createAppointmentMutation.mutate({
                branchId: branch.id,
                customerName: newCustName,
                customerPhone: newCustPhone,
                customerNote: newCustNote,
                serviceId: newServiceId,
                staffMembershipId: newStaffId || undefined,
                resourceId: newResourceId || undefined,
                bookingDate: selectedDate,
                startTime: newTimeSlot,
                status: 'CONFIRMED',
              });
            }}
          >
            {createAppointmentMutation.isError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                {createAppointmentMutation.error instanceof Error ? createAppointmentMutation.error.message : 'เกิดข้อผิดพลาดในการลงคิว กรุณาลองใหม่อีกครั้ง'}
              </div>
            )}

            <label>
              ชื่อลูกค้า
              <input
                required
                placeholder="เช่น คุณสมศักดิ์"
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
              />
            </label>

            <label>
              เบอร์โทรศัพท์
              <input
                required
                placeholder="เช่น 0812345678"
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
              />
            </label>

            <label>
              เลือกบริการ
              <AppSelect
                value={newServiceId}
                onChange={e => setNewServiceId(e.target.value)}
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes} นาที) - {money.format(Number(s.price))}
                  </option>
                ))}
              </AppSelect>
            </label>

            <div className="form-grid">
              <label>
                ช่างผู้ให้บริการ (ถ้ามี)
                <AppSelect
                  value={newStaffId}
                  onChange={e => setNewStaffId(e.target.value)}
                >
                  <option value="">เวียนคิวช่างว่าง (Any)</option>
                  {staffList.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.displayName}
                    </option>
                  ))}
                </AppSelect>
              </label>

              <label>
                เก้าอี้ / สเตชัน
                <AppSelect
                  value={newResourceId}
                  onChange={e => setNewResourceId(e.target.value)}
                >
                  <option value="">เก้าอี้ว่างอัตโนมัติ</option>
                  {resources.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </AppSelect>
              </label>
            </div>

            <label>
              วันที่นัดหมาย
              <input
                type="date"
                required
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </label>

            <label>
              เลือกรอบเวลา (ที่ว่าง)
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                maxHeight: 140,
                overflowY: 'auto',
                padding: '8px 0',
              }}>
                {(availabilityData?.availableSlots || ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']).map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setNewTimeSlot(slot)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 8,
                      border: newTimeSlot === slot ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      background: newTimeSlot === slot ? '#e0f2fe' : '#fff',
                      color: newTimeSlot === slot ? '#0284c7' : '#334155',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </label>

            <label>
              หมายเหตุเพิ่มเติม
              <input
                placeholder="เช่น ขอสระน้ำอุ่น, แบบผมวินเทจ"
                value={newCustNote}
                onChange={e => setNewCustNote(e.target.value)}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddAppModal(false)}
                style={{ flex: 1 }}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={createAppointmentMutation.isPending || !newTimeSlot}
                style={{ flex: 1 }}
              >
                {createAppointmentMutation.isPending ? 'กำลังบันทึก…' : 'ยืนยันลงคิว'}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {/* Modal: Add Service */}
      {showAddServiceModal && (
        <dialog open className="modal" style={{ maxWidth: 480, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>เพิ่มบริการใหม่</h3>
            <button type="button" className="icon-button" onClick={() => setShowAddServiceModal(false)}>
              <X size={18} />
            </button>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              createServiceMutation.mutate({
                branchId: branch.id,
                name: newSvcName,
                category: newSvcCategory,
                durationMinutes: Number(newSvcDuration),
                bufferMinutes: Number(newSvcBuffer),
                price: Number(newSvcPrice),
                description: newSvcDesc,
              });
            }}
          >
            {createServiceMutation.isError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                {createServiceMutation.error instanceof Error ? createServiceMutation.error.message : 'เกิดข้อผิดพลาดในการบันทึกบริการ'}
              </div>
            )}

            <label>
              ชื่อบริการ
              <input
                required
                placeholder="เช่น สปาศีรษะและดีท็อกซ์เส้นผม"
                value={newSvcName}
                onChange={e => setNewSvcName(e.target.value)}
              />
            </label>

            <label>
              หมวดหมู่บริการ
              <input
                required
                placeholder="เช่น ตัดผม, ทำสี, ทรีทเมนต์"
                value={newSvcCategory}
                onChange={e => setNewSvcCategory(e.target.value)}
              />
            </label>

            <div className="form-grid">
              <label>
                ระยะเวลาทำบริการ (นาที)
                <input
                  type="number"
                  min="5"
                  step="5"
                  required
                  value={newSvcDuration}
                  onChange={e => setNewSvcDuration(Number(e.target.value))}
                />
              </label>

              <label>
                เวลาพักก่อนรอบถัดไป (นาที)
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={newSvcBuffer}
                  onChange={e => setNewSvcBuffer(Number(e.target.value))}
                />
              </label>
            </div>

            <label>
              ราคาค่าบริการ (บาท)
              <input
                type="number"
                min="0"
                step="1"
                required
                value={newSvcPrice}
                onChange={e => setNewSvcPrice(Number(e.target.value))}
              />
            </label>

            <label>
              คำอธิบายรายละเอียดบริการ
              <textarea
                rows={2}
                placeholder="เช่น นวดผ่อนคลายด้วยน้ำมันอโรมา พร้อมเซ็ตทรง"
                value={newSvcDesc}
                onChange={e => setNewSvcDesc(e.target.value)}
                style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: 8 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddServiceModal(false)}
                style={{ flex: 1 }}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={createServiceMutation.isPending}
                style={{ flex: 1 }}
              >
                {createServiceMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกบริการ'}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {/* Modal: Add Resource */}
      {showAddResourceModal && (
        <dialog open className="modal" style={{ maxWidth: 440, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>เพิ่มเก้าอี้ / สเตชัน</h3>
            <button type="button" className="icon-button" onClick={() => setShowAddResourceModal(false)}>
              <X size={18} />
            </button>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              createResourceMutation.mutate({
                branchId: branch.id,
                name: newResName,
                type: newResType,
                description: newResDesc,
              });
            }}
          >
            {createResourceMutation.isError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                {createResourceMutation.error instanceof Error ? createResourceMutation.error.message : 'เกิดข้อผิดพลาดในการบันทึกเก้าอี้/จุดบริการ'}
              </div>
            )}

            <label>
              ชื่อเก้าอี้ / สเตชัน
              <input
                required
                placeholder="เช่น เก้าอี้บาร์เบอร์ 03"
                value={newResName}
                onChange={e => setNewResName(e.target.value)}
              />
            </label>

            <label>
              ประเภท
              <AppSelect
                value={newResType}
                onChange={e => setNewResType(e.target.value as any)}
              >
                <option value="CHAIR">เก้าอี้ตัดผม (CHAIR)</option>
                <option value="STATION">เตียงสระ / สเตชัน (STATION)</option>
                <option value="ROOM">ห้องทำบริการ VIP (ROOM)</option>
                <option value="TABLE">โต๊ะบริการ (TABLE)</option>
              </AppSelect>
            </label>

            <label>
              รายละเอียด / จุดที่ตั้ง
              <input
                placeholder="เช่น โซนหน้าติดกระจก"
                value={newResDesc}
                onChange={e => setNewResDesc(e.target.value)}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddResourceModal(false)}
                style={{ flex: 1 }}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={createResourceMutation.isPending}
                style={{ flex: 1 }}
              >
                {createResourceMutation.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {/* Modal: Edit Service */}
      {editingService && (
        <dialog open className="modal" style={{ maxWidth: 480, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>แก้ไขบริการ</h3>
            <button type="button" className="icon-button" onClick={() => setEditingService(null)}>
              <X size={18} />
            </button>
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              updateServiceMutation.mutate({
                id: editingService.id,
                input: {
                  name: editSvcName,
                  category: editSvcCategory,
                  durationMinutes: Number(editSvcDuration),
                  bufferMinutes: Number(editSvcBuffer),
                  price: Number(editSvcPrice),
                  description: editSvcDesc,
                  active: editSvcActive,
                },
              });
            }}
          >
            {updateServiceMutation.isError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                {updateServiceMutation.error instanceof Error ? updateServiceMutation.error.message : 'เกิดข้อผิดพลาดในการแก้ไขบริการ'}
              </div>
            )}

            <label>
              ชื่อบริการ
              <input
                required
                value={editSvcName}
                onChange={e => setEditSvcName(e.target.value)}
              />
            </label>

            <label>
              หมวดหมู่บริการ
              <input
                value={editSvcCategory}
                onChange={e => setEditSvcCategory(e.target.value)}
              />
            </label>

            <div className="form-grid">
              <label>
                ระยะเวลา (นาที)
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={editSvcDuration}
                  onChange={e => setEditSvcDuration(Number(e.target.value))}
                />
              </label>

              <label>
                เวลาพักช่าง (นาที)
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={editSvcBuffer}
                  onChange={e => setEditSvcBuffer(Number(e.target.value))}
                />
              </label>
            </div>

            <label>
              ราคา (บาท)
              <input
                type="number"
                min={0}
                step={10}
                value={editSvcPrice}
                onChange={e => setEditSvcPrice(Number(e.target.value))}
              />
            </label>

            <label>
              คำอธิบายรายละเอียดบริการ
              <textarea
                rows={2}
                value={editSvcDesc}
                onChange={e => setEditSvcDesc(e.target.value)}
                style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: 8 }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 20px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editSvcActive}
                onChange={e => setEditSvcActive(e.target.checked)}
              />
              <span style={{ fontSize: '0.9rem', color: '#1e293b' }}>เปิดให้บริการ (แสดงในรายการและหน้าจองออนไลน์)</span>
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingService(null)}
                style={{ flex: 1 }}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="primary"
                disabled={updateServiceMutation.isPending}
                style={{ flex: 1 }}
              >
                {updateServiceMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </dialog>
  );
}
