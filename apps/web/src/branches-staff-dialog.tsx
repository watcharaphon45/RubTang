import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  CheckCircle2,
  Plus,
  Shield,
  UserCheck,
  Users,
  X,
  Briefcase,
  Store,
} from 'lucide-react';
import {
  api,
  Branch,
  getPositions,
  Position,
  StaffMember,
  updateStaffPosition,
} from './api';
import { AppSelect } from './components/app-select';

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
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

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

  const positionsQuery = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions(),
  });

  const createBranchMutation = useMutation({
    mutationFn: (name: string) => api<Branch>('/branches', { name }),
    onSuccess: async newBranch => {
      setNotice(`เพิ่มสาขา "${newBranch.name}" เรียบร้อยแล้ว`);
      setTimeout(() => setNotice(null), 3000);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ]);
      if (onBranchCreated) await onBranchCreated();
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ staffId, positionId }: { staffId: string; positionId: string | null }) =>
      updateStaffPosition(staffId, positionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      setNotice('ปรับปรุงตำแหน่งงานของพนักงานเรียบร้อยแล้ว');
      setTimeout(() => setNotice(null), 3000);
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: async (body: {
      displayName: string;
      email: string;
      password: string;
      role: 'MANAGER' | 'CASHIER';
      branchIds: string[];
      positionId?: string;
    }) => {
      const staff = await api<StaffMember>('/staff', {
        displayName: body.displayName,
        email: body.email,
        password: body.password,
        role: body.role,
        branchIds: body.branchIds,
      });

      if (body.positionId && staff.id) {
        await updateStaffPosition(staff.id, body.positionId);
      }
      return staff;
    },
    onSuccess: async newStaff => {
      setNotice(`เพิ่มพนักงาน "${newStaff.displayName}" เรียบร้อยแล้ว`);
      setTimeout(() => setNotice(null), 3000);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      setSelectedBranches([]);
      setSelectedPositionId('');
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
      {
        displayName,
        email,
        password,
        role,
        branchIds: selectedBranches,
        positionId: selectedPositionId || undefined,
      },
      { onSuccess: () => form.reset() },
    );
  }

  function toggleBranch(branchId: string) {
    setSelectedBranches(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId],
    );
  }

  const branches = branchesQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const positions = positionsQuery.data ?? [];

  return (
    <dialog
      ref={dialog}
      className="modal branches-staff-dialog"
      aria-labelledby="branch-staff-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
      style={{ maxWidth: '880px', width: '96vw', padding: '24px 28px' }}
    >
      {/* Header */}
      <div className="section-heading" style={{ marginBottom: '6px' }}>
        <div>
          <span className="eyebrow green">STORE MANAGEMENT · ข้อมูลร้าน</span>
          <h2 id="branch-staff-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 0' }}>
            <Building2 size={22} color="#0877ee" /> จัดการสาขาและพนักงาน
          </h2>
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      <p className="muted" style={{ margin: '0 0 16px 0', fontSize: '13px' }}>
        เพิ่มสาขาของร้าน จัดการบัญชีพนักงาน กำหนดสาขาที่รับผิดชอบ และผูกตำแหน่งงานตามระบบ RBAC
      </p>

      {notice && (
        <div
          className="success"
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#eaf8ef',
            border: '1px solid #b7e4c7',
            color: '#16825d',
            marginBottom: '14px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}

      {/* Modern Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #dce7f6',
          marginBottom: '20px',
          paddingBottom: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('branches')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: activeTab === 'branches' ? '1px solid #0877ee' : '1px solid #dce7f6',
            background: activeTab === 'branches' ? '#0877ee' : '#fff',
            color: activeTab === 'branches' ? '#fff' : '#31547d',
            fontWeight: activeTab === 'branches' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeTab === 'branches' ? '0 2px 6px rgba(8, 119, 238, 0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Building2 size={16} />
          สาขาของร้าน ({branches.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: activeTab === 'staff' ? '1px solid #0877ee' : '1px solid #dce7f6',
            background: activeTab === 'staff' ? '#0877ee' : '#fff',
            color: activeTab === 'staff' ? '#fff' : '#31547d',
            fontWeight: activeTab === 'staff' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeTab === 'staff' ? '0 2px 6px rgba(8, 119, 238, 0.25)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={16} />
          พนักงาน & ตำแหน่งงาน ({staff.length})
        </button>
      </div>

      {/* TAB 1: BRANCHES */}
      {activeTab === 'branches' && (
        <section>
          {/* Add Branch Card */}
          <div
            style={{
              background: '#f8fbff',
              padding: '16px 18px',
              borderRadius: '10px',
              border: '1px solid #dce7f6',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ fontSize: '14px', margin: '0 0 10px', color: '#163d70', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> เพิ่มสาขาใหม่
            </h3>
            <form onSubmit={handleBranchSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="ชื่อสาขา เช่น สาขาสยามพารากอน หรือ สาขา 2"
                style={{
                  flex: 1,
                  margin: 0,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cfe0f5',
                  background: '#fff',
                  fontSize: '13px',
                }}
              />
              <button
                className="primary"
                disabled={createBranchMutation.isPending}
                style={{ whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '13px' }}
              >
                {createBranchMutation.isPending ? 'กำลังบันทึก…' : 'เพิ่มสาขา'}
              </button>
            </form>
            {createBranchMutation.error && (
              <p role="alert" className="error" style={{ marginTop: '10px', marginBottom: 0 }}>
                {createBranchMutation.error instanceof Error
                  ? createBranchMutation.error.message
                  : 'ไม่สามารถเพิ่มสาขาได้'}
              </p>
            )}
          </div>

          <h3 style={{ fontSize: '14px', color: '#163d70', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Store size={16} color="#0877ee" /> รายชื่อสาขาทั้งหมด ({branches.length})
          </h3>

          {branchesQuery.isLoading ? (
            <div className="empty-state" role="status">กำลังโหลดสาขา…</div>
          ) : branches.length === 0 ? (
            <div className="empty-state">ยังไม่มีข้อมูลสาขา</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {branches.map(b => {
                const assignedCount = staff.filter(s => s.branches.some(sb => sb.id === b.id)).length;
                return (
                  <div
                    key={b.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #dce7f6',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 1px 3px rgba(8, 119, 238, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            background: '#eaf4ff',
                            color: '#0877ee',
                            padding: '8px',
                            borderRadius: '8px',
                            display: 'flex',
                          }}
                        >
                          <Building2 size={18} />
                        </div>
                        <strong style={{ fontSize: '14px', color: '#102f5d' }}>{b.name}</strong>
                      </div>
                      <span className="pill green" style={{ fontSize: '10px' }}>เปิดใช้งาน</span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#607a9d', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} /> พนักงานที่รับผิดชอบ: <strong>{assignedCount}</strong> คน
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: STAFF */}
      {activeTab === 'staff' && (
        <section>
          {/* Add Staff Card */}
          <div
            style={{
              background: '#f8fbff',
              padding: '18px 20px',
              borderRadius: '10px',
              border: '1px solid #dce7f6',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ fontSize: '14px', margin: '0 0 14px', color: '#163d70', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> เพิ่มพนักงานใหม่
            </h3>
            <form onSubmit={handleStaffSubmit}>
              <div className="form-grid" style={{ marginBottom: '12px', gap: '12px' }}>
                <label style={{ margin: 0, fontSize: '12px', color: '#163d70' }}>
                  ชื่อพนักงาน
                  <input
                    name="displayName"
                    required
                    maxLength={100}
                    placeholder="เช่น สมชาย ใจดี"
                    style={{ marginTop: '5px' }}
                  />
                </label>
                <label style={{ margin: 0, fontSize: '12px', color: '#163d70' }}>
                  อีเมล (สำหรับใช้ Login เข้าสู่ระบบ)
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="staff@example.com"
                    style={{ marginTop: '5px' }}
                  />
                </label>
              </div>

              <div className="form-grid" style={{ marginBottom: '12px', gap: '12px' }}>
                <label style={{ margin: 0, fontSize: '12px', color: '#163d70' }}>
                  รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    placeholder="รหัสผ่านอย่างน้อย 12 ตัวอักษร"
                    style={{ marginTop: '5px' }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label style={{ margin: 0, fontSize: '12px', color: '#163d70' }}>
                    บทบาทหลัก (Role)
                    <div style={{ marginTop: '5px' }}>
                      <AppSelect icon={<Shield size={15} />} name="role" defaultValue="CASHIER">
                        <option value="CASHIER">แคชเชียร์ (ขายหน้าร้าน)</option>
                        <option value="MANAGER">ผู้จัดการ (ขาย + สต็อก)</option>
                      </AppSelect>
                    </div>
                  </label>
                  <label style={{ margin: 0, fontSize: '12px', color: '#163d70' }}>
                    ตำแหน่งงาน (RBAC Position)
                    <div style={{ marginTop: '5px' }}>
                      <AppSelect
                        icon={<Briefcase size={15} />}
                        value={selectedPositionId}
                        onChange={e => setSelectedPositionId(e.target.value)}
                      >
                        <option value="">ตามบทบาทระบบ (Default)</option>
                        {positions.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </AppSelect>
                    </div>
                  </label>
                </div>
              </div>

              {/* Branch Assignment Chips */}
              <div style={{ margin: '14px 0 16px' }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '12px', color: '#163d70' }}>
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
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: isChecked ? '1px solid #0877ee' : '1px solid #dce7f6',
                          background: isChecked ? '#eaf4ff' : '#fff',
                          color: isChecked ? '#0877ee' : '#315a86',
                          fontWeight: isChecked ? 600 : 400,
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isChecked ? <Check size={14} /> : <Building2 size={14} color="#8297b0" />}
                        {branch.name}
                      </button>
                    );
                  })}
                </div>
                {selectedBranches.length === 0 && (
                  <small style={{ color: '#c23f45', display: 'block', marginTop: '6px' }}>
                    * กรุณากดเลือกสาขาที่พนักงานคนนี้มีสิทธิ์ทำงานอย่างน้อย 1 สาขา
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
                  style={{ padding: '9px 18px', fontSize: '13px' }}
                >
                  {createStaffMutation.isPending ? 'กำลังบันทึก…' : 'เพิ่มพนักงาน'}
                </button>
              </div>
            </form>
          </div>

          <h3 style={{ fontSize: '14px', color: '#163d70', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={16} color="#0877ee" /> รายชื่อพนักงานทั้งหมด ({staff.length})
          </h3>

          {staffQuery.isLoading ? (
            <div className="empty-state" role="status">กำลังโหลดรายชื่อพนักงาน…</div>
          ) : staff.length === 0 ? (
            <div className="empty-state">ยังไม่มีพนักงาน</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {staff.map(member => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    background: '#fff',
                    border: '1px solid #dce7f6',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 1px 3px rgba(8, 119, 238, 0.04)',
                  }}
                >
                  {/* Left: Avatar & Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                    <div
                      className="avatar"
                      style={{
                        width: '40px',
                        height: '40px',
                        fontSize: '14px',
                        fontWeight: 700,
                        background: '#eaf4ff',
                        color: '#0877ee',
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: '50%',
                      }}
                    >
                      {member.displayName.slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '14px', color: '#102f5d' }}>{member.displayName}</strong>
                        <span
                          className={`pill ${member.role === 'OWNER' ? 'green' : ''}`}
                          style={{ fontSize: '10px', padding: '2px 7px' }}
                        >
                          {roleNames[member.role] ?? member.role}
                        </span>
                      </div>
                      <small style={{ color: '#607a9d', fontSize: '12px' }}>{member.email}</small>
                    </div>
                  </div>

                  {/* Middle: Position RBAC Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '200px' }}>
                    <Briefcase size={15} color="#0877ee" />
                    <div style={{ minWidth: '170px' }}>
                      <AppSelect
                        value={member.position?.id ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          updatePositionMutation.mutate({
                            staffId: member.id,
                            positionId: val || null,
                          });
                        }}
                        disabled={member.role === 'OWNER'}
                      >
                        <option value="">ตามบทบาท ({roleNames[member.role] ?? member.role})</option>
                        {positions.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </AppSelect>
                    </div>
                  </div>

                  {/* Right: Assigned Branches */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#607a9d' }}>สาขา:</span>
                    {member.branches.length === 0 ? (
                      <span className="pill green" style={{ fontSize: '10px' }}>ทุกสาขา (เจ้าของร้าน)</span>
                    ) : (
                      member.branches.map(b => (
                        <span
                          key={b.id}
                          className="pill"
                          style={{
                            fontSize: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Building2 size={11} /> {b.name}
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
