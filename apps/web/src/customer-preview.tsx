import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Plus, Search, UserRound, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Customer = { id: number; name: string; phone: string; points: number; spent: number; coupon: string | null };
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

/** Local customer and loyalty sample records; they reset with the browser page. */
export function CustomerPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [customers, setCustomers] = useState<Customer[]>(previewSeeds.customers);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer>();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const visible = useMemo(() => customers.filter(customer => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())), [customers, query]);
  function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const input = new FormData(event.currentTarget); const name = String(input.get('name') ?? '').trim(); const phone = String(input.get('phone') ?? '').trim(); if (!name || !phone) return; const customer = { id: Date.now(), name, phone, points: 0, spent: 0, coupon: null }; setCustomers(items => [...items, customer]); setSelected(customer); event.currentTarget.reset(); }
  function redeem() { if (!selected || selected.points < 100) return; const updated = { ...selected, points: selected.points - 100, coupon: 'ลด 50 บาท' }; setCustomers(items => items.map(item => item.id === updated.id ? updated : item)); setSelected(updated); }
  return <dialog ref={dialog} className="modal customer-preview" aria-labelledby="customer-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · CRM</span><h2 id="customer-preview-title">ลูกค้าและคะแนนสะสม</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ข้อมูลลูกค้าและ loyalty ตัวอย่างสำหรับตรวจ flow หน้าร้าน</p>
    <div className="customer-layout"><section><div className="search customer-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อ หรือเบอร์โทร" aria-label="ค้นหาลูกค้า" /></div><div className="customer-list">{visible.map(customer => <button className={`customer-row ${selected?.id === customer.id ? 'selected' : ''}`} onClick={() => setSelected(customer)} key={customer.id}><UserRound size={19} /><span><strong>{customer.name}</strong><small>{customer.phone}</small></span><strong>{customer.points} คะแนน</strong></button>)}</div><form className="customer-form" onSubmit={add}><input name="name" maxLength={100} required placeholder="ชื่อลูกค้า" /><input name="phone" maxLength={30} required placeholder="เบอร์โทร" /><button className="secondary"><Plus size={16} />เพิ่มลูกค้า</button></form></section><section className="customer-detail">{selected ? <><div className="customer-avatar">{selected.name.slice(0, 1)}</div><h3>{selected.name}</h3><p className="muted">{selected.phone}</p><div className="loyalty-stats"><div><small>คะแนนสะสม</small><strong>{selected.points}</strong></div><div><small>ยอดซื้อสะสม</small><strong>{money.format(selected.spent)}</strong></div></div>{selected.coupon ? <div className="coupon"><Gift size={18} /><span><strong>{selected.coupon}</strong><small>ใช้ได้กับรายการถัดไป</small></span></div> : <button className="primary" disabled={selected.points < 100} onClick={redeem}>ใช้ 100 คะแนน แลกคูปอง 50 บาท</button>}<p className="help">อัตราตัวอย่าง: ทุก 25 บาท = 1 คะแนน</p></> : <div className="customer-empty"><UserRound size={34} /><p>เลือกลูกค้าเพื่อดูข้อมูล</p></div>}</section></div><p className="help">โหมดตัวอย่าง: ไม่เก็บข้อมูลส่วนบุคคลหรือคะแนนจริง</p>
  </dialog>;
}
