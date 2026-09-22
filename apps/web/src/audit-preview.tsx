import { useEffect, useMemo, useRef, useState } from 'react';
import { History, Search, X } from 'lucide-react';
import { previewSeeds } from './preview-data';
import { AppSelect } from './components/app-select';

type Audit = { id: number; at: string; actor: string; action: string; entity: string; oldValue: string; newValue: string };
const records: Audit[] = previewSeeds.audits;

/** Static audit timeline for validating filters and before/after display. */
export function AuditPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('ทั้งหมด');
  const [selected, setSelected] = useState<Audit>();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const visible = useMemo(() => records.filter(item => (action === 'ทั้งหมด' || item.action === action) && `${item.actor} ${item.entity} ${item.action}`.toLowerCase().includes(query.toLowerCase())), [action, query]);
  return <dialog ref={dialog} className="modal audit-preview" aria-labelledby="audit-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · AUDIT LOG</span><h2 id="audit-preview-title">ประวัติการเปลี่ยนแปลง</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ตัวอย่างข้อมูล audit สำหรับติดตามการเปลี่ยนแปลงสำคัญของร้าน</p>
    <div className="audit-filters"><div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาผู้ทำรายการ หรือรายการ" aria-label="ค้นหา audit log" /></div><AppSelect value={action} onChange={event => setAction(event.target.value)} aria-label="กรองประเภท"><option>ทั้งหมด</option><option>ปรับสต็อก</option><option>แก้ไขสินค้า</option><option>เปิดกะเงินสด</option><option>เปลี่ยนโปรโมชั่น</option></AppSelect></div><div className="audit-layout"><section className="audit-list">{visible.map(item => <button className={selected?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => setSelected(item)}><History size={18} /><span><strong>{item.action} · {item.entity}</strong><small>{item.at} · {item.actor}</small></span></button>)}{visible.length === 0 && <p className="muted">ไม่พบรายการ</p>}</section><section className="audit-detail">{selected ? <><h3>{selected.action}</h3><p className="muted">{selected.entity}<br />{selected.at} · {selected.actor}</p><div className="audit-values"><div><small>ก่อนเปลี่ยน</small><strong>{selected.oldValue}</strong></div><div><small>หลังเปลี่ยน</small><strong>{selected.newValue}</strong></div></div></> : <div className="audit-empty"><History size={32} /><p>เลือกรายการเพื่อดูรายละเอียด</p></div>}</section></div><p className="help">โหมดตัวอย่าง: ข้อมูลนี้ไม่ใช่ audit trail จริงและไม่สามารถใช้ตรวจสอบทางบัญชีได้</p>
  </dialog>;
}
