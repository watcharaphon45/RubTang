import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  Scissors,
  Sparkles,
  User,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Copy,
  Share2,
} from 'lucide-react';
import {
  getPublicBookingInfo,
  getPublicBookingAvailability,
  submitPublicBooking,
  PublicBookingInfo,
  BookingAppointmentItem,
} from './api';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

interface PublicBookingScreenProps {
  branchId: string;
}

export function PublicBookingScreen({ branchId }: PublicBookingScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Selections
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');

  // Customer contact info
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerNote, setCustomerNote] = useState<string>('');

  // Success result
  const [bookingResult, setBookingResult] = useState<{
    bookingCode: string;
    appointment: BookingAppointmentItem;
    message: string;
  } | null>(null);

  // Fetch Public Salon Info
  const { data: salonInfo, isLoading: isLoadingSalon } = useQuery({
    queryKey: ['public-booking-info', branchId],
    queryFn: () => getPublicBookingInfo(branchId),
  });

  // Set default selected service once loaded
  useEffect(() => {
    if (salonInfo?.services && salonInfo.services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(salonInfo.services[0].id);
    }
  }, [salonInfo, selectedServiceId]);

  // Fetch Available Slots for selected Service + Date + Stylist
  const { data: slotData, isLoading: isLoadingSlots, refetch: refetchSlots } = useQuery({
    queryKey: ['public-booking-slots', branchId, selectedServiceId, selectedDate, selectedStaffId],
    queryFn: () => getPublicBookingAvailability(branchId, selectedServiceId, selectedDate, selectedStaffId || undefined),
    enabled: Boolean(branchId && selectedServiceId && selectedDate),
  });

  // Submit Booking Mutation
  const submitMutation = useMutation({
    mutationFn: (payload: {
      customerName: string;
      customerPhone: string;
      customerNote?: string;
      serviceId: string;
      staffMembershipId?: string;
      bookingDate: string;
      startTime: string;
    }) => submitPublicBooking(branchId, payload),
    onSuccess: data => {
      setBookingResult(data);
      setStep(4);
    },
  });

  const selectedService = useMemo(() => {
    return salonInfo?.services.find(s => s.id === selectedServiceId);
  }, [salonInfo, selectedServiceId]);

  const selectedStaff = useMemo(() => {
    return salonInfo?.staff.find(st => st.id === selectedStaffId);
  }, [salonInfo, selectedStaffId]);

  // Group services by category
  const categories = useMemo(() => {
    if (!salonInfo?.services) return [];
    const map = new Map<string, typeof salonInfo.services>();
    for (const s of salonInfo.services) {
      const cat = s.category || 'บริการทั่วไป';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).map(([name, list]) => ({ name, list }));
  }, [salonInfo]);

  // Next 7 days list for date chips
  const upcomingDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      dates.push({
        iso,
        dayLabel: i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : dayNames[d.getDay()],
        dateNum: d.getDate(),
        month: d.toLocaleDateString('th-TH', { month: 'short' }),
      });
    }
    return dates;
  }, []);

  if (isLoadingSalon) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          border: '3px solid #e2e8f0',
          borderTopColor: '#0284c7',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ marginTop: 16, color: '#64748b', fontSize: '0.95rem' }}>กำลังโหลดข้อมูลบริการของร้าน…</p>
      </div>
    );
  }

  const tenantName = salonInfo?.tenant.name || 'ร้านรับตังค์ บาร์เบอร์ & ซาลอน';
  const branchName = salonInfo?.branch.name || 'สาขาหลัก';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f1f5f9 0%, #f8fafc 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#0f172a',
      paddingBottom: 80,
    }}>
      {/* Top Banner Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0b2347 0%, #0369a1 100%)',
        color: '#fff',
        padding: '24px 20px 20px',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        boxShadow: '0 8px 24px rgba(3, 105, 161, 0.15)',
      }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}>
              ONLINE BOOKING · จองคิวออนไลน์
            </span>
          </div>

          <h1 style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 800 }}>
            {tenantName}
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, fontSize: '0.85rem', color: '#bae6fd' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={15} />
              {branchName}
            </span>
            {salonInfo?.branch.phone && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={15} />
                {salonInfo.branch.phone}
              </span>
            )}
          </div>

          {/* Stepper Progress */}
          {step < 4 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: step >= 1 ? 1 : 0.5 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  background: step >= 1 ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                  color: step >= 1 ? '#0b2347' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                }}>
                  1
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>เลือกบริการ</span>
              </div>

              <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.2)', margin: '0 8px' }}>
                <div style={{ height: '100%', width: step >= 2 ? '100%' : '0%', background: '#38bdf8', transition: 'width 0.3s' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: step >= 2 ? 1 : 0.5 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  background: step >= 2 ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                  color: step >= 2 ? '#0b2347' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                }}>
                  2
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>วัน & เวลา</span>
              </div>

              <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.2)', margin: '0 8px' }}>
                <div style={{ height: '100%', width: step >= 3 ? '100%' : '0%', background: '#38bdf8', transition: 'width 0.3s' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: step >= 3 ? 1 : 0.5 }}>
                <div style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  background: step >= 3 ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                  color: step >= 3 ? '#0b2347' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                }}>
                  3
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>ข้อมูลติดต่อ</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '16px 16px 0' }}>
        {/* STEP 1: Select Service */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
                เลือกบริการที่ต้องการ
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                แตะเพื่อเลือกบริการที่ต้องการจองคิว
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {categories.map(cat => (
                <div key={cat.name}>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#0284c7',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Scissors size={15} />
                    <span>{cat.name}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {cat.list.map(svc => {
                      const isSelected = selectedServiceId === svc.id;
                      return (
                        <div
                          key={svc.id}
                          onClick={() => setSelectedServiceId(svc.id)}
                          style={{
                            background: '#fff',
                            borderRadius: 14,
                            border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                            padding: '14px 16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{svc.name}</strong>
                              {isSelected && (
                                <span style={{
                                  background: '#0284c7',
                                  color: '#fff',
                                  borderRadius: 10,
                                  width: 18,
                                  height: 18,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  <Check size={12} strokeWidth={3} />
                                </span>
                              )}
                            </div>

                            {svc.description && (
                              <p style={{ margin: '4px 0 6px', fontSize: '0.85rem', color: '#64748b' }}>
                                {svc.description}
                              </p>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: '#64748b' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={13} style={{ color: '#0284c7' }} />
                                {svc.durationMinutes} นาที
                              </span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', minWidth: 80 }}>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7' }}>
                              {money.format(svc.price)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Floating Bar */}
            <div style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#fff',
              borderTop: '1px solid #e2e8f0',
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'center',
              boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
              zIndex: 50,
            }}>
              <div style={{ maxWidth: 540, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>บริการที่เลือก</div>
                  <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>
                    {selectedService?.name || 'กรุณาเลือกบริการ'}
                  </strong>
                </div>

                <button
                  type="button"
                  className="primary"
                  disabled={!selectedServiceId}
                  onClick={() => setStep(2)}
                  style={{
                    padding: '12px 24px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 12,
                  }}
                >
                  <span>ต่อไป: เลือกเวลา</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Select Stylist, Date & Available Slot */}
        {step === 2 && (
          <div>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'none',
                color: '#0284c7',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0',
                marginBottom: 12,
              }}
            >
              <ChevronLeft size={16} />
              <span>ย้อนกลับไปเปลี่ยนบริการ</span>
            </button>

            {/* Selected Service Snippet */}
            <div style={{
              background: '#e0f2fe',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0369a1' }}>บริการที่เลือก</div>
                <strong style={{ fontSize: '0.95rem', color: '#0c4a6e' }}>{selectedService?.name}</strong>
                <div style={{ fontSize: '0.8rem', color: '#0369a1' }}>{selectedService?.durationMinutes} นาที</div>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284c7' }}>
                {money.format(selectedService?.price || 0)}
              </div>
            </div>

            {/* Stylist Selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={16} style={{ color: '#0284c7' }} />
                <span>เลือกช่างผู้ให้บริการ</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div
                  onClick={() => setSelectedStaffId('')}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: selectedStaffId === '' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    padding: '12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: selectedStaffId === '' ? '#0284c7' : '#f1f5f9',
                    color: selectedStaffId === '' ? '#fff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 6px',
                  }}>
                    <Sparkles size={18} />
                  </div>
                  <strong style={{ fontSize: '0.85rem', display: 'block', color: '#0f172a' }}>เวียนคิวช่างว่าง</strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ช่างคนใดก็ได้</span>
                </div>

                {salonInfo?.staff.map(st => {
                  const isStSelected = selectedStaffId === st.id;
                  return (
                    <div
                      key={st.id}
                      onClick={() => setSelectedStaffId(st.id)}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        border: isStSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        padding: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        background: isStSelected ? '#0284c7' : '#f1f5f9',
                        color: isStSelected ? '#fff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 6px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                      }}>
                        {st.displayName.slice(0, 1)}
                      </div>
                      <strong style={{ fontSize: '0.85rem', display: 'block', color: '#0f172a' }}>{st.displayName}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>{st.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Date Quick Strip */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarDays size={16} style={{ color: '#0284c7' }} />
                <span>เลือกวันที่ต้องการจอง</span>
              </div>

              <div style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 6,
                WebkitOverflowScrolling: 'touch',
              }}>
                {upcomingDates.map(item => {
                  const isDSelected = selectedDate === item.iso;
                  return (
                    <div
                      key={item.iso}
                      onClick={() => {
                        setSelectedDate(item.iso);
                        setSelectedTimeSlot('');
                      }}
                      style={{
                        minWidth: 70,
                        padding: '10px 8px',
                        borderRadius: 12,
                        border: isDSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        background: isDSelected ? '#0284c7' : '#fff',
                        color: isDSelected ? '#fff' : '#0f172a',
                        textAlign: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: isDSelected ? 0.9 : 0.6 }}>
                        {item.dayLabel}
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, margin: '2px 0' }}>
                        {item.dateNum}
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: isDSelected ? 0.9 : 0.6 }}>
                        {item.month}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Picker */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={16} style={{ color: '#0284c7' }} />
                <span>รอบเวลาว่างสำหรับวันที่ {selectedDate}</span>
              </div>

              {isLoadingSlots ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                  กำลังตรวจสอบรอบเวลาว่าง…
                </div>
              ) : !slotData?.availableSlots || slotData.availableSlots.length === 0 ? (
                <div style={{
                  padding: 24,
                  textAlign: 'center',
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                }}>
                  <AlertCircle size={24} style={{ color: '#eab308', margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>
                    รอบเวลาสำหรับช่างและบริการนี้ในวันที่เลือกเต็มแล้ว กรุณาเลือกวันอื่นหรือเลือกช่างท่านอื่นครับ
                  </p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                }}>
                  {slotData.availableSlots.map(slot => {
                    const isSlotSelected = selectedTimeSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedTimeSlot(slot)}
                        style={{
                          padding: '12px 6px',
                          borderRadius: 10,
                          border: isSlotSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: isSlotSelected ? '#e0f2fe' : '#fff',
                          color: isSlotSelected ? '#0284c7' : '#1e293b',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSlotSelected ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
                        }}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Floating Bar */}
            <div style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: '#fff',
              borderTop: '1px solid #e2e8f0',
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'center',
              boxShadow: '0 -4px 12px rgba(0,0,0,0.05)',
              zIndex: 50,
            }}>
              <div style={{ maxWidth: 540, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>เวลาที่เลือก</div>
                  <strong style={{ fontSize: '0.95rem', color: '#0284c7' }}>
                    {selectedTimeSlot ? `${selectedTimeSlot} น. (${selectedDate})` : 'ยังไม่ได้เลือกรอบเวลา'}
                  </strong>
                </div>

                <button
                  type="button"
                  className="primary"
                  disabled={!selectedTimeSlot}
                  onClick={() => setStep(3)}
                  style={{
                    padding: '12px 24px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 12,
                  }}
                >
                  <span>ต่อไป: ข้อมูลติดต่อ</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Customer Info & Confirmation */}
        {step === 3 && (
          <div>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'none',
                color: '#0284c7',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0',
                marginBottom: 12,
              }}
            >
              <ChevronLeft size={16} />
              <span>ย้อนกลับไปเปลี่ยนวันเวลา</span>
            </button>

            {/* Summary Card */}
            <div style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              padding: '16px 18px',
              marginBottom: 20,
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                สรุปรายการนัดหมาย
              </h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>บริการ:</span>
                <strong>{selectedService?.name}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>ช่างผู้ให้บริการ:</span>
                <strong style={{ color: '#0284c7' }}>{selectedStaff?.displayName || 'เวียนคิวช่างว่าง (Any)'}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>วันที่ & เวลา:</span>
                <strong>{selectedDate} · {selectedTimeSlot} น.</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                <span style={{ color: '#64748b' }}>ระยะเวลาโดยประมาณ:</span>
                <span>{selectedService?.durationMinutes} นาที</span>
              </div>

              <div style={{
                borderTop: '1px dashed #cbd5e1',
                paddingTop: 10,
                marginTop: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>ยอดชำระหน้าร้าน (ประมาณการ):</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>
                  {money.format(selectedService?.price || 0)}
                </span>
              </div>
            </div>

            {/* Input Form */}
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!customerName.trim() || !customerPhone.trim()) {
                  alert('กรุณากรอกชื่อและเบอร์โทรศัพท์สำหรับติดต่อยืนยันคิว');
                  return;
                }
                submitMutation.mutate({
                  customerName,
                  customerPhone,
                  customerNote,
                  serviceId: selectedServiceId,
                  staffMembershipId: selectedStaffId || undefined,
                  bookingDate: selectedDate,
                  startTime: selectedTimeSlot,
                });
              }}
              style={{
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                padding: '20px 18px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#0f172a', fontWeight: 700 }}>
                ข้อมูลสำหรับติดต่อยืนยันคิว
              </h3>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                  ชื่อของคุณ (ลูกค้า) *
                </span>
                <input
                  required
                  placeholder="เช่น คุณกิตติพงศ์"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                  }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                  เบอร์โทรศัพท์มือถือ *
                </span>
                <input
                  type="tel"
                  required
                  placeholder="เช่น 0812345678"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                  }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 20 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                  ความต้องการพิเศษ / หมายเหตุ (ถ้ามี)
                </span>
                <textarea
                  rows={2}
                  placeholder="เช่น ผมหยักศกหนา, ขอน้ำอุ่น, ทรงผมเฟดวินเทจ"
                  value={customerNote}
                  onChange={e => setCustomerNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                  }}
                />
              </label>

              <div style={{
                background: '#f8fafc',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: '0.8rem',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}>
                <ShieldCheck size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>ข้อมูลของคุณปลอดภัย ไม่มีการเปิดเผยภายนอกร้าน</span>
              </div>

              {submitMutation.isError && (
                <div style={{
                  background: '#fee2e2',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  marginBottom: 16,
                }}>
                  {submitMutation.error instanceof Error ? submitMutation.error.message : 'เกิดข้อผิดพลาดในการจอง กรุณาลองใหม่อีกครั้ง'}
                </div>
              )}

              <button
                type="submit"
                className="primary"
                disabled={submitMutation.isPending}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {submitMutation.isPending ? 'กำลังยืนยันการจอง…' : 'ยืนยันการจองคิว'}
              </button>
            </form>
          </div>
        )}

        {/* STEP 4: Booking Ticket & Confirmation Pass */}
        {step === 4 && bookingResult && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            {/* Success Icon */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 4px 16px rgba(22, 163, 74, 0.2)',
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 6px', color: '#0f172a' }}>
              จองคิวนัดหมายสำเร็จ!
            </h2>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
              ระบบได้บันทึกคิวของคุณเรียบร้อยแล้ว กรุณาบันทึกรหัสการจองนี้ไว้
            </p>

            {/* Boarding Pass / Ticket Card */}
            <div style={{
              background: '#fff',
              borderRadius: 18,
              border: '2px solid #0284c7',
              padding: '24px 20px',
              textAlign: 'left',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.1)',
              marginBottom: 20,
            }}>
              <div style={{
                textAlign: 'center',
                paddingBottom: 16,
                borderBottom: '2px dashed #e2e8f0',
                marginBottom: 16,
              }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>รหัสคิวของคุณ (Booking Code)</span>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: 900,
                  color: '#0284c7',
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                  margin: '4px 0',
                }}>
                  {bookingResult.bookingCode}
                </div>
                <span className="pill" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                  CONFIRMED · ได้รับการยืนยันแล้ว
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>ชื่อผู้จอง:</span>
                  <strong>{bookingResult.appointment.customerName}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>เบอร์โทร:</span>
                  <strong>{bookingResult.appointment.customerPhone}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>บริการ:</span>
                  <strong style={{ color: '#0284c7' }}>{selectedService?.name}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>วัน & เวลา:</span>
                  <strong>{bookingResult.appointment.bookingDate} เวลา {bookingResult.appointment.startTime} น.</strong>
                </div>

                {selectedStaff && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>ช่างประจำตัว:</span>
                    <strong>{selectedStaff.displayName}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>ร้าน & สาขา:</span>
                  <span>{tenantName} ({branchName})</span>
                </div>
              </div>

              <div style={{
                marginTop: 16,
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: 10,
                fontSize: '0.8rem',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Clock size={16} style={{ color: '#0284c7', flexShrink: 0 }} />
                <span>กรุณามาถึงร้านก่อนเวลาประมาณ 5 - 10 นาที เพื่อเตรียมตัวเข้ารับบริการครับ</span>
              </div>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={() => {
                setStep(1);
                setSelectedTimeSlot('');
                setBookingResult(null);
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: 12,
              }}
            >
              จองคิวใหม่อีกรายการ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
