import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building,
  Check,
  Edit,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
  User,
  X,
} from 'lucide-react';
import { api, Profile, SupplierData } from './api';

export function SupplierDialog({
  profile,
  close,
}: {
  profile: Profile;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCreditDays, setFormCreditDays] = useState('0');

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () =>
      api<SupplierData[]>(`/suppliers?${new URLSearchParams({ search: search.trim() })}`),
  });

  const suppliers = suppliersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api<SupplierData>('/suppliers', payload),
    onSuccess: async newSupp => {
      setNotice(`เพิ่มผู้จำหน่าย "${newSupp.name}" เรียบร้อยแล้ว`);
      setIsCreating(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSelectedSupplier(newSupp);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api<SupplierData>(`/suppliers/${id}`, payload),
    onSuccess: async updated => {
      setNotice(`อัปเดตข้อมูลผู้จำหน่าย "${updated.name}" เรียบร้อยแล้ว`);
      setEditingSupplier(null);
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSelectedSupplier(updated);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<SupplierData>(`/suppliers/${id}`, { active }),
    onSuccess: async updated => {
      setNotice(
        `เปลี่ยนสถานะเป็น ${updated.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} เรียบร้อยแล้ว`,
      );
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      if (selectedSupplier?.id === updated.id) {
        setSelectedSupplier(updated);
      }
    },
  });

  function resetForm() {
    setFormName('');
    setFormContactName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormCreditDays('0');
  }

  function startCreate() {
    resetForm();
    setEditingSupplier(null);
    setIsCreating(true);
    setNotice(null);
  }

  function startEdit(s: SupplierData) {
    setEditingSupplier(s);
    setFormName(s.name);
    setFormContactName(s.contactName ?? '');
    setFormPhone(s.phone ?? '');
    setFormEmail(s.email ?? '');
    setFormAddress(s.address ?? '');
    setFormCreditDays(String(s.creditDays ?? 0));
    setIsCreating(false);
    setNotice(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload = {
      name: formName.trim(),
      contactName: formContactName.trim() || undefined,
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
      creditDays: Math.max(0, parseInt(formCreditDays, 10) || 0),
    };

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const canManage = profile.role === 'OWNER' || profile.role === 'MANAGER';

  return (
    <dialog
      ref={dialog}
      className="modal supplier-preview"
      aria-labelledby="supplier-dialog-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
      style={{ maxWidth: '960px', width: '95vw' }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">PROCUREMENT · จัดการคู่ค้า</span>
          <h2 id="supplier-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={22} color="#0877ee" /> ผู้จำหน่าย / ซัพพลายเออร์
          </h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      <p className="muted" style={{ margin: '-8px 0 16px 0', fontSize: '13px' }}>
        จัดการรายชื่อคู่ค้า ข้อมูลติดต่อ และเงื่อนไขเครดิตเทอมสำหรับออกใบสั่งซื้อ (PO) และตรวจรับสินค้าเข้าคลัง
      </p>

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

      {(createMutation.isError || updateMutation.isError) && (
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
          {(createMutation.error as any)?.message ||
            (updateMutation.error as any)?.message ||
            'เกิดข้อผิดพลาดในการบันทึกข้อมูล'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', minHeight: '440px' }}>
        {/* Left Column: Supplier List */}
        <section
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div className="search" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ, ผู้ติดต่อ, หรือเบอร์โทร..."
                aria-label="ค้นหาผู้จำหน่าย"
                style={{ fontSize: '12px' }}
              />
            </div>
            {canManage && (
              <button
                type="button"
                className="primary"
                onClick={startCreate}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> เพิ่มคู่ค้า
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {suppliersQuery.isLoading ? (
              <p className="muted" style={{ padding: '20px', textAlign: 'center' }}>กำลังโหลดรายชื่อผู้จำหน่าย...</p>
            ) : suppliers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}>
                <Building size={36} strokeWidth={1.5} style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ margin: 0 }}>{search ? 'ไม่พบผู้จำหน่ายที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลผู้จำหน่ายในระบบ'}</p>
                {canManage && !search && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={startCreate}
                    style={{ marginTop: '10px', fontSize: '12px' }}
                  >
                    เพิ่มผู้จำหน่ายแรก
                  </button>
                )}
              </div>
            ) : (
              suppliers.map(s => {
                const isSelected = selectedSupplier?.id === s.id;
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => {
                      setSelectedSupplier(s);
                      setIsCreating(false);
                      setEditingSupplier(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid #0877ee' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      opacity: s.active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: s.active ? '#dbeafe' : '#f1f5f9',
                          color: s.active ? '#1d4ed8' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                        }}
                      >
                        {s.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>{s.name}</strong>
                        <small style={{ color: '#64748b', fontSize: '11px' }}>
                          {s.contactName ? `${s.contactName} · ` : ''}{s.phone || 'ไม่มีเบอร์โทร'}
                        </small>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: s.creditDays > 0 ? '#fef3c7' : '#f1f5f9',
                          color: s.creditDays > 0 ? '#b45309' : '#64748b',
                          fontWeight: 600,
                        }}
                      >
                        {s.creditDays > 0 ? `เครดิต ${s.creditDays} วัน` : 'เงินสด'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right Column: Form or Details */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isCreating || editingSupplier ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                  {editingSupplier ? 'แก้ไขข้อมูลผู้จำหน่าย' : 'เพิ่มผู้จำหน่ายใหม่'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingSupplier(null);
                  }}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px' }}
                >
                  ยกเลิก
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    ชื่อผู้จำหน่าย / บริษัท <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    placeholder="เช่น บริษัท สยามเบเวอเรจ จำกัด"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      ชื่อผู้ติดต่อ / พนักงานขาย
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="เช่น คุณวิเชียร"
                      value={formContactName}
                      onChange={e => setFormContactName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      type="tel"
                      maxLength={30}
                      placeholder="08X-XXX-XXXX"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      อีเมลติดต่อ
                    </label>
                    <input
                      type="email"
                      placeholder="contact@supplier.com"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      เครดิตเทอม (วัน)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={formCreditDays}
                      onChange={e => setFormCreditDays(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    ที่อยู่ / สถานที่ติดต่อ
                  </label>
                  <textarea
                    rows={3}
                    maxLength={255}
                    placeholder="เลขที่ อาคาร ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingSupplier(null);
                    }}
                    style={{ fontSize: '13px' }}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={createMutation.isPending || updateMutation.isPending || !formName.trim()}
                    style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <Loader2 size={14} className="spinning" />
                    ) : (
                      <Check size={14} />
                    )}
                    {editingSupplier ? 'บันทึกการแก้ไข' : 'บันทึกผู้จำหน่าย'}
                  </button>
                </div>
              </form>
            </div>
          ) : selectedSupplier ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: selectedSupplier.active ? '#0877ee' : '#94a3b8',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '18px',
                    }}
                  >
                    {selectedSupplier.name.slice(0, 1)}
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>{selectedSupplier.name}</h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: selectedSupplier.active ? '#ecfdf5' : '#fef2f2',
                          color: selectedSupplier.active ? '#065f46' : '#991b1b',
                          fontWeight: 600,
                        }}
                      >
                        {selectedSupplier.active ? 'กำลังติดต่อ' : 'ระงับการติดต่อ'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        เครดิตเทอม: <strong>{selectedSupplier.creditDays} วัน</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {canManage && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => startEdit(selectedSupplier)}
                      style={{ padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Edit size={13} /> แก้ไข
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: selectedSupplier.id,
                          active: !selectedSupplier.active,
                        })
                      }
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: selectedSupplier.active ? '#dc2626' : '#16a34a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Power size={13} />
                      {selectedSupplier.active ? 'ระงับ' : 'เปิดใช้'}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <User size={16} color="#64748b" />
                  <span>ผู้ติดต่อ: <strong>{selectedSupplier.contactName || '-'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <Phone size={16} color="#64748b" />
                  <span>เบอร์โทร: <strong>{selectedSupplier.phone || '-'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <Mail size={16} color="#64748b" />
                  <span>อีเมล: <strong>{selectedSupplier.email || '-'}</strong></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#334155' }}>
                  <MapPin size={16} color="#64748b" style={{ marginTop: '2px' }} />
                  <span>ที่อยู่: <strong>{selectedSupplier.address || '-'}</strong></span>
                </div>

                <div style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ fontSize: '12px', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    สถิติการสั่งซื้อ (PO)
                  </strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>จำนวนใบสั่งซื้อที่เคยออก:</span>
                    <strong>{selectedSupplier.poCount ?? 0} ฉบับ</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <Building size={48} strokeWidth={1.5} style={{ margin: '0 auto 12px', display: 'block' }} />
              <h4 style={{ margin: 0, color: '#64748b' }}>เลือกผู้จำหน่ายเพื่อดูข้อมูล</h4>
              <p style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
                คลิกเลือกคู่ค้าจากรายการด้านซ้าย หรือกดปุ่ม "เพิ่มคู่ค้า" เพื่อสร้างรายการใหม่
              </p>
            </div>
          )}
        </section>
      </div>
    </dialog>
  );
}
