import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Plus, Shield, UserCheck, Users, X } from 'lucide-react';
import { api, Branch, StaffMember } from './api';

const roleNames: Record<StaffMember['role'], string> = {
  OWNER: 'เจ้าของร้าน',
  MANAGER: 'ผู้จัดการ',
  CASHIER: 'แคชเชียร์',
};

export function BranchesStaffDialog({
  close,
  onBranchCreated,
}: {
  close: () => void;
  onBranchCreated?: () => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'branches' | 'staff'>('branches');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<StaffMember[]>('/staff'),
  });

  const createBranchMutation = useMutation({
    mutationFn: (name: string) => api<Branch>('/branches', { name }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ]);
      if (onBranchCreated) await onBranchCreated();
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: (body: {
      displayName: string;
      email: string;
      password: string;
      role: 'MANAGER' | 'CASHIER';
      branchIds: string[];
    }) => api<StaffMember>('/staff', body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      setSelectedBranches([]);
    },
  });

  function handleBranchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    if (!name) return;
    createBranchMutation.mutate(name, {
      onSuccess: () => form.reset(),
    });
  }

  function handleStaffSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const displayName = String(values.get('displayName') ?? '').trim();
    const email = String(values.get('email') ?? '').trim();
    const password = String(values.get('password') ?? '').trim();
    const role = values.get('role') === 'MANAGER' ? 'MANAGER' : 'CASHIER';

    if (!displayName || !email || password.length < 12 || selectedBranches.length === 0) {
      return;
    }

    createStaffMutation.mutate(
      { displayName, email, password, role, branchIds: selectedBranches },
      { onSuccess: () => form.reset() }
    );
  }

  function toggleBranch(branchId: string) {
    setSelectedBranches(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    );
  }

  const branches = branchesQuery.data ?? [];
  const staff = staffQuery.data ?? [];

  return (
    <dialog
      ref={dialog}
      className="modal branches-staff-dialog"
      aria-labelledby="branch-staff-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
      style={{ width: 'min(780px, 96vw)' }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">STORE MANAGEMENT · ข้อมูลร้าน</span>
          <h2 id="branch-staff-title">จัดการสาขาและพนักงาน</h2>
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
          <X />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #dce7f6', margin: '16px 0 20px' }}>
        <button
          type="button"
          className="text-button"
          onClick={() => setActiveTab('branches')}
          style={{
            padding: '10px 16px',
            borderBottom: activeTab === 'branches' ? '2px solid #0877ee' : '2px solid transparent',
            color: activeTab === 'branches' ? '#0877ee' : '#607a9d',
            fontWeight: activeTab === 'branches' ? 700 : 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Building2 size={17} />
          สาขาของร้าน ({branches.length})
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setActiveTab('staff')}
          style={{
            padding: '10px 16px',
            borderBottom: activeTab === 'staff' ? '2px solid #0877ee' : '2px solid transparent',
            color: activeTab === 'staff' ? '#0877ee' : '#607a9d',
            fontWeight: activeTab === 'staff' ? 700 : 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={17} />
          พนักงานและสิทธิ์ ({staff.length})
        </button>
      </div>

      {activeTab === 'branches' && (
        <section>
          <div style={{ background: '#f5f9ff', padding: '16px', borderRadius: '10px', border: '1px solid #dbe8f8', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', margin: '0 0 10px', color: '#163d70', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> เพิ่มสาขาใหม่
            </h3>
            <form onSubmit={handleBranchSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="ชื่อสาขา เช่น สาขาสยามพารากอน หรือ สาขา 2"
                style={{ flex: 1, margin: 0 }}
              />
              <button className="primary" disabled={createBranchMutation.isPending} style={{ whiteSpace: 'nowrap' }}>
                {createBranchMutation.isPending ? 'กำลังบันทึก…' : 'เพิ่มสาขา'}
              </button>
            </form>
            {createBranchMutation.error && (
              <p role="alert" className="error" style={{ marginTop: '10px' }}>
                {createBranchMutation.error instanceof Error
                  ? createBranchMutation.error.message
                  : 'ไม่สามารถเพิ่มสาขาได้'}
              </p>
            )}
          </div>

          <h3 style={{ fontSize: '14px', color: '#607a9d', margin: '0 0 12px' }}>รายชื่อสาขาทั้งหมด ({branches.length})</h3>
          {branchesQuery.isLoading ? (
            <p className="muted">กำลังโหลดสาขา…</p>
          ) : branches.length === 0 ? (
            <p className="muted">ยังไม่มีสาขา</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {branches.map(branch => (
                <div
                  key={branch.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#fff',
                    border: '1px solid #dce7f6',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#eaf4ff', color: '#0877ee', padding: '8px', borderRadius: '8px', display: 'flex' }}>
                      <Building2 size={18} />
                    </div>
                    <strong>{branch.name}</strong>
                  </div>
                  <span className="status">เปิดใช้งาน</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'staff' && (
        <section>
          <div style={{ background: '#f5f9ff', padding: '16px', borderRadius: '10px', border: '1px solid #dbe8f8', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', margin: '0 0 10px', color: '#163d70', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> เพิ่มพนักงานใหม่
            </h3>
            <form onSubmit={handleStaffSubmit}>
              <div className="form-grid">
                <label style={{ margin: '0 0 10px' }}>
                  ชื่อพนักงาน
                  <input name="displayName" required maxLength={100} placeholder="เช่น สมชาย ใจดี" />
                </label>
                <label style={{ margin: '0 0 10px' }}>
                  อีเมล (สำหรับใช้ Login)
                  <input name="email" type="email" required maxLength={254} placeholder="staff@example.com" />
                </label>
              </div>

              <div className="form-grid">
                <label style={{ margin: '0 0 10px' }}>
                  รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)
                  <input name="password" type="password" required minLength={12} maxLength={128} placeholder="รหัสผ่านอย่างน้อย 12 ตัวอักษร" />
                </label>
                <label style={{ margin: '0 0 10px' }}>
                  บทบาทหน้าที่
                  <select name="role" defaultValue="CASHIER" style={{ width: '100%', border: '1px solid #dce4df', borderRadius: '8px', padding: '11px', marginTop: '7px', background: '#fff' }}>
                    <option value="CASHIER">แคชเชียร์ (ขายหน้าร้าน)</option>
                    <option value="MANAGER">ผู้จัดการ (ขาย + จัดการสต็อก)</option>
                  </select>
                </label>
              </div>

              <div style={{ margin: '10px 0 16px' }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '13px' }}>
                  กำหนดสาขาที่อนุญาตให้เข้าถึง (อย่างน้อย 1 สาขา):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {branches.map(branch => {
                    const isChecked = selectedBranches.includes(branch.id);
                    return (
                      <button
                        type="button"
                        key={branch.id}
                        onClick={() => toggleBranch(branch.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: isChecked ? '1px solid #0877ee' : '1px solid #dce7f6',
                          background: isChecked ? '#eaf4ff' : '#fff',
                          color: isChecked ? '#0877ee' : '#315a86',
                          fontWeight: isChecked ? 600 : 400,
                          fontSize: '12px',
                        }}
                      >
                        {isChecked && <Check size={14} />}
                        {branch.name}
                      </button>
                    );
                  })}
                </div>
                {selectedBranches.length === 0 && (
                  <small style={{ color: '#c23f45', display: 'block', marginTop: '6px' }}>
                    * กรุณากดเลือกสาขาอย่างน้อย 1 สาขา
                  </small>
                )}
              </div>

              {createStaffMutation.error && (
                <p role="alert" className="error" style={{ marginBottom: '12px' }}>
                  {createStaffMutation.error instanceof Error
                    ? createStaffMutation.error.message
                    : 'ไม่สามารถเพิ่มพนักงานได้'}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="primary"
                  disabled={createStaffMutation.isPending || selectedBranches.length === 0}
                >
                  {createStaffMutation.isPending ? 'กำลังบันทึก…' : 'เพิ่มพนักงาน'}
                </button>
              </div>
            </form>
          </div>

          <h3 style={{ fontSize: '14px', color: '#607a9d', margin: '0 0 12px' }}>รายชื่อพนักงานทั้งหมด ({staff.length})</h3>
          {staffQuery.isLoading ? (
            <p className="muted">กำลังโหลดรายชื่อพนักงาน…</p>
          ) : staff.length === 0 ? (
            <p className="muted">ยังไม่มีพนักงาน</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {staff.map(member => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#fff',
                    border: '1px solid #dce7f6',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="avatar" style={{ width: '36px', height: '36px', fontSize: '13px' }}>
                      {member.displayName.slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>{member.displayName}</strong>
                        <span
                          className={`pill ${member.role === 'OWNER' ? 'green' : ''}`}
                          style={{ fontSize: '10px', padding: '3px 8px' }}
                        >
                          {roleNames[member.role] ?? member.role}
                        </span>
                      </div>
                      <small style={{ color: '#607a9d' }}>{member.email}</small>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#607a9d' }}>สาขา:</span>
                    {member.branches.length === 0 ? (
                      <span className="pill" style={{ fontSize: '10px' }}>ทุกสาขา (เจ้าของร้าน)</span>
                    ) : (
                      member.branches.map(b => (
                        <span key={b.id} className="pill" style={{ fontSize: '10px' }}>
                          {b.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </dialog>
  );
}
