import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Building, Phone, Plus, Search, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Supplier = { id: number; name: string; contact: string; phone: string; credit: number };
const initial: Supplier[] = previewSeeds.suppliers;

/** Browser-only supplier management prototype. */
export function SupplierPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [suppliers, setSuppliers] = useState(initial);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Supplier>();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const visible = useMemo(() => suppliers.filter(item => `${item.name} ${item.contact} ${item.phone}`.toLowerCase().includes(query.toLowerCase())), [query, suppliers]);
  function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name') ?? '').trim(); if (!name) return; const supplier = { id: Date.now(), name, contact: String(data.get('contact') ?? '').trim() || 'ยังไม่ได้ระบุ', phone: String(data.get('phone') ?? '').trim() || '-', credit: Math.max(Number(data.get('credit')) || 0, 0) }; setSuppliers(items => [...items, supplier]); setSelected(supplier); event.currentTarget.reset(); }
  return <dialog ref={dialog} className="modal supplier-preview" aria-labelledby="supplier-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · PROCUREMENT</span><h2 id="supplier-preview-title">ผู้จำหน่าย</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">จัดการคู่ค้าและเงื่อนไขเครดิตก่อนผูกกับสินค้าและ Purchase Order จริง</p>
    <div className="supplier-layout"><section><div className="search supplier-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อ ผู้ติดต่อ หรือโทรศัพท์" aria-label="ค้นหาผู้จำหน่าย" /></div><div className="supplier-list">{visible.map(item => <button className={`supplier-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelected(item)}><Building size={19} /><span><strong>{item.name}</strong><small>{item.contact} · {item.phone}</small></span><strong>{item.credit} วัน</strong></button>)}</div></section><section className="supplier-detail">{selected ? <><span className="supplier-mark">{selected.name.slice(0, 1)}</span><h3>{selected.name}</h3><p><Phone size={15} /> {selected.phone}</p><div><small>ผู้ติดต่อ</small><strong>{selected.contact}</strong></div><div><small>เครดิตเทอม</small><strong>{selected.credit} วัน</strong></div></> : <div className="supplier-empty"><Building size={34} /><p>เลือกผู้จำหน่ายเพื่อดูข้อมูล</p></div>}</section></div><form className="supplier-form" onSubmit={add}><input name="name" maxLength={150} required placeholder="ชื่อผู้จำหน่าย" /><input name="contact" maxLength={100} placeholder="ผู้ติดต่อ" /><input name="phone" maxLength={30} placeholder="โทรศัพท์" /><input name="credit" type="number" min="0" max="365" placeholder="เครดิต (วัน)" /><button className="secondary"><Plus size={16} />เพิ่มผู้จำหน่าย</button></form><p className="help">โหมดตัวอย่าง: ไม่มีการบันทึกข้อมูลติดต่อหรือการผูกสินค้าเข้าฐานข้อมูล</p>
  </dialog>;
}
