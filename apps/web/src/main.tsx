import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Boxes, Building2, Check, ChevronDown, LogOut, Package, Plus, Search, ShieldCheck, Store, X } from 'lucide-react';
import { api, ApiError, Product, Profile } from './api';
import { HistoryDialog, StockForm } from './inventory';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
const currency = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

function Brand() { return <div className="brand"><span className="brand-icon"><Store size={23} /></span><div>รับตังค์<span>RUBTANG POS</span></div></div>; }
function ErrorMessage({ error }: { error: unknown }) { return error ? <p role="alert" className="error">{error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่'}</p> : null; }

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [register, setRegister] = useState(false);
  const mutation = useMutation({ mutationFn: (body: Record<string, FormDataEntryValue>) => api(register ? '/auth/register' : '/auth/login', body), onSuccess });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); mutation.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  return <main className="auth-layout">
    <section className="welcome"><Brand /><div className="welcome-copy"><span className="eyebrow">YOUR EVERYDAY BUSINESS COMPANION</span><h1>ดูแลร้านง่ายขึ้น<br />พร้อมเติบโตไปด้วยกัน</h1><p>เริ่มต้นจัดการสินค้าและสาขาของคุณ<br />จากพื้นที่ทำงานเดียวที่เป็นระเบียบ</p><div className="welcome-art"><Store size={88} strokeWidth={1} /><span className="floating-tag"><Check size={16} /> ร้านของคุณ พร้อมเริ่มต้น</span></div></div><small>RubTang · เริ่มต้นธุรกิจให้เป็นระบบ</small></section>
    <section className="auth-panel"><form onSubmit={submit} className="auth-form"><span className="pill">จัดการร้านของคุณ</span><h2>{register ? 'เปิดร้านกับรับตังค์' : 'ยินดีต้อนรับกลับมา'}</h2><p className="muted">{register ? 'สร้างบัญชีเจ้าของร้านและสาขาแรกของคุณ' : 'เข้าสู่ระบบเพื่อจัดการสินค้าและสาขา'}</p>
      {register && <><label>ชื่อผู้ใช้งาน<input name="displayName" autoComplete="name" required maxLength={100} /></label><label>ชื่อร้าน<input name="shopName" required maxLength={120} placeholder="เช่น ร้านสุขใจ" /></label><label>ชื่อสาขาแรก<input name="branchName" required maxLength={120} defaultValue="สาขาหลัก" /></label></>}
      <label>อีเมล<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
      <label>รหัสผ่าน<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128} placeholder={register ? 'อย่างน้อย 12 ตัวอักษร' : 'กรอกรหัสผ่าน'} /></label>
      <ErrorMessage error={mutation.error} /><button className="primary auth-submit" disabled={mutation.isPending}>{mutation.isPending ? 'กำลังดำเนินการ…' : register ? 'สร้างร้านและเริ่มใช้งาน' : 'เข้าสู่ระบบ'}<ArrowRight size={18} /></button>
      <p className="switch-auth">{register ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'} <button type="button" className="text-button" disabled={mutation.isPending} onClick={() => { setRegister(!register); mutation.reset(); }}>{register ? 'เข้าสู่ระบบ' : 'สร้างร้านใหม่'}</button></p>
    </form></section>
  </main>;
}

function ProductForm({ close, saved, product }: { close: () => void; saved: () => void; product?: Product }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mutation = useMutation({ mutationFn: (body: Record<string, unknown>) => api(product ? `/products/${product.id}` : '/products', body), onSuccess: saved });
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    mutation.mutate(product ? { ...values, active: values.active === 'on' } : values);
  }
  return <dialog ref={dialog} className="modal" aria-labelledby="product-title" onCancel={event => { event.preventDefault(); if (!mutation.isPending) close(); }}><div className="section-heading"><h2 id="product-title">{product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2><button type="button" className="icon-button" onClick={close} aria-label="ปิด" disabled={mutation.isPending}><X /></button></div><p className="muted">การเปลี่ยนแปลงสินค้ามีผลกับทุกสาขาของร้าน</p><form onSubmit={submit}>
    <label>ชื่อสินค้า<input name="name" autoFocus required maxLength={200} defaultValue={product?.name} placeholder="เช่น น้ำดื่ม 600 มล." /></label>
    <div className="form-grid"><label>รหัส SKU<input name="sku" required maxLength={80} defaultValue={product?.sku} placeholder="DRINK-001" /></label><label>บาร์โค้ด (ถ้ามี)<input name="barcode" maxLength={80} defaultValue={product?.barcode ?? ''} /></label></div>
    <label>ราคาขาย (บาท)<input name="price" type="number" min="0" max="9999999999.99" step="0.01" required defaultValue={product?.price} placeholder="0.00" /></label>
    {product ? <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={product.active} />เปิดใช้งานสินค้า</label> : <p className="help">สินค้าใหม่เริ่มต้นด้วยสต็อก 0 จากนั้นกดรับเข้า / ปรับสต็อกเพื่อเพิ่มจำนวน</p>}
    <ErrorMessage error={mutation.error} /><div className="modal-actions"><button type="button" className="secondary" onClick={close} disabled={mutation.isPending}>ยกเลิก</button><button className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}</button></div>
  </form></dialog>;
}

function Workspace({ profile, logout }: { profile: Profile; logout: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(profile.branches[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product>();
  const [stockProduct, setStockProduct] = useState<Product>();
  const [showHistory, setShowHistory] = useState(false);
  const branch = profile.branches.find(item => item.id === branchId);
  const [notice, setNotice] = useState('');
  const logoutMutation = useMutation({ mutationFn: logout });
  const products = useQuery({ queryKey: ['products', profile.tenant.id, branchId, query], queryFn: () => api<Product[]>(`/products?${new URLSearchParams({ branchId, search: query })}`), enabled: Boolean(branchId) });
  async function saved() { setShowForm(false); setEditProduct(undefined); setNotice('บันทึกสินค้าเรียบร้อยแล้ว'); await queryClient.invalidateQueries({ queryKey: ['products'] }); }
  async function refreshStock() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['movements'] })]); }
  return <div className="workspace"><aside className="sidebar"><Brand /><div className="shop-card"><span className="shop-avatar">{profile.tenant.name.slice(0, 1)}</span><div><strong>{profile.tenant.name}</strong><small>พื้นที่จัดการร้าน</small></div></div><span className="nav-caption">พื้นที่ทำงาน</span><div className="nav-item active"><Package size={19} />สินค้า</div><div className="sidebar-note"><ShieldCheck size={22} /><strong>เริ่มต้นอย่างเป็นระบบ</strong><p>จัดเตรียมรายการสินค้าของร้าน ก่อนเปิดใช้งานหน้าขาย</p></div><div className="user-card"><span className="avatar">{profile.user.displayName.slice(0, 1)}</span><div><strong>{profile.user.displayName}</strong><small>{profile.role === 'OWNER' ? 'เจ้าของร้าน' : profile.role === 'MANAGER' ? 'ผู้จัดการ' : 'แคชเชียร์'}</small></div><button className="icon-button" aria-label="ออกจากระบบ" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}><LogOut size={18} /></button></div></aside>
    <div className="main-area"><header className="topbar"><span>พื้นที่ทำงาน <span className="divider">/</span> <strong>สินค้า</strong></span><div className="branch-picker"><Building2 size={17} /><select aria-label="สาขา" value={branchId} onChange={e => setBranchId(e.target.value)}>{profile.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14} /></div></header>
    <main className="content"><div className="page-heading"><div><span className="eyebrow green">PRODUCT CATALOG</span><h1>สินค้าของร้าน</h1><p className="muted">จัดการรายการสินค้าและตรวจสอบสต็อกแยกตามสาขา</p></div>{profile.role === 'OWNER' && <button className="primary" onClick={() => { setNotice(''); setShowForm(true); }}><Plus size={18} />เพิ่มสินค้า</button>}</div>
      <div className="info-banner"><div className="banner-icon"><Boxes size={26} /></div><div><strong>สินค้าเดียวกัน จัดการได้ทุกสาขา</strong><p>รายการสินค้าใช้ร่วมกันทั้งร้าน ยอดคงเหลือแสดงเฉพาะสาขาที่เลือก</p></div><span className="pill">แยกสต็อกตามสาขา</span></div>
      {notice && <p className="success" role="status"><Check size={16} />{notice}</p>}<ErrorMessage error={logoutMutation.error} />
      <div className="inventory-toolbar"><button className="secondary" disabled={!branch} onClick={() => setShowHistory(true)}>ประวัติสต็อกสาขานี้</button></div>
      <section className="catalog"><div className="catalog-toolbar"><div><h2>รายการสินค้า</h2><span className="muted small">แสดงสูงสุด 100 รายการล่าสุด</span></div><form className="search" onSubmit={e => { e.preventDefault(); setQuery(search); }}><Search size={18} /><input aria-label="ค้นหาสินค้า" placeholder="ค้นหาชื่อ, SKU หรือบาร์โค้ด" value={search} onChange={e => setSearch(e.target.value)} maxLength={100} /><button type="submit">ค้นหา</button></form></div>
        {products.isPending ? <div className="empty-state" role="status">กำลังโหลดสินค้า…</div> : products.isError ? <div className="empty-state"><ErrorMessage error={products.error} /><button className="secondary" onClick={() => products.refetch()}>ลองอีกครั้ง</button></div> : products.data?.length ? <div className="table-scroll"><table><thead><tr><th>สินค้า</th><th>SKU / บาร์โค้ด</th><th className="numeric">ราคาขาย</th><th className="numeric">คงเหลือในสาขา</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{products.data.map(p => <tr key={p.id}><td><div className="product-name"><span className="product-icon"><Package size={20} /></span><strong>{p.name}</strong></div></td><td><div>{p.sku}</div><small className="muted">{p.barcode || 'ไม่มีบาร์โค้ด'}</small></td><td className="numeric">{currency.format(Number(p.price))}</td><td className="numeric">{Number(p.quantity).toLocaleString('th-TH', { maximumFractionDigits: 3 })}</td><td><span className={`status ${p.active ? '' : 'inactive'}`}>{p.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td><div className="row-actions">{profile.role === 'OWNER' && <button className="text-button" onClick={() => { setEditProduct(p); setShowForm(true); }}>แก้ไข</button>}{profile.role !== 'CASHIER' && <button className="text-button" disabled={!p.active} onClick={() => setStockProduct(p)}>รับเข้า / ปรับสต็อก</button>}{profile.role === 'CASHIER' && <span className="muted">ดูข้อมูล</span>}</div></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><Package size={35} strokeWidth={1.5} /></span><h3>{query ? 'ไม่พบสินค้าที่ค้นหา' : 'เริ่มจากสินค้าชิ้นแรกของคุณ'}</h3><p>{query ? 'ลองค้นหาด้วยชื่อสินค้า รหัส SKU หรือบาร์โค้ดอื่น' : 'เพิ่มชื่อสินค้า รหัส SKU และราคา เพื่อเตรียมร้านให้พร้อม'}</p>{!query && profile.role === 'OWNER' && <button className="secondary" onClick={() => setShowForm(true)}><Plus size={16} />เพิ่มสินค้าแรก</button>}</div>}
      </section><footer className="page-footer">RubTang POS <span>พื้นที่ทำงานของ {profile.tenant.name}</span></footer>
    </main></div>{showForm && <ProductForm product={editProduct} close={() => { setShowForm(false); setEditProduct(undefined); }} saved={() => void saved()} />}
    {stockProduct && branch && <StockForm product={stockProduct} branch={branch} close={() => { setStockProduct(undefined); void refreshStock(); }} saved={() => { setStockProduct(undefined); setNotice('บันทึกรายการสต็อกเรียบร้อยแล้ว'); void refreshStock(); }} />}
    {showHistory && branch && <HistoryDialog branch={branch} close={() => setShowHistory(false)} />}
  </div>;
}

function App() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/auth/me') });
  if (profile.isPending) return <div className="loading"><Brand /><p>กำลังเชื่อมต่อร้านของคุณ…</p></div>;
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 401) return <AuthScreen onSuccess={() => { void queryClient.invalidateQueries({ queryKey: ['profile'] }); }} />;
    return <div className="loading"><Brand /><h2>ยังเชื่อมต่อระบบไม่ได้</h2><ErrorMessage error={profile.error} /><button className="primary" onClick={() => profile.refetch()}>ลองอีกครั้ง</button></div>;
  }
  return <Workspace key={profile.data.tenant.id} profile={profile.data} logout={async () => { await api('/auth/logout', {}); queryClient.clear(); window.location.reload(); }} />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></React.StrictMode>);
