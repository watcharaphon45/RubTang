import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Sale = { id: string; createdAt: string; cashier: string; payment: string; total: number; items: { name: string; quantity: number; price: number }[] };
const sales: Sale[] = previewSeeds.sales;
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

/** Static sales records for validating the history and receipt UI before persistence exists. */
export function SalesHistoryPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Sale>();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const visible = useMemo(() => sales.filter(sale => `${sale.id} ${sale.cashier}`.toLowerCase().includes(query.toLowerCase())), [query]);
  return <dialog ref={dialog} className="modal sales-preview" aria-labelledby="sales-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · SALES</span><h2 id="sales-preview-title">ประวัติการขาย</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>
    <p className="muted">รายการจำลองสำหรับตรวจหน้าจอประวัติการขายและใบเสร็จ</p>
    <div className="sales-layout"><section><div className="search sales-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาเลขที่บิล หรือพนักงาน" aria-label="ค้นหาประวัติการขาย" /></div><div className="sale-list">{visible.map(sale => <button className={`sale-row ${selected?.id === sale.id ? 'selected' : ''}`} key={sale.id} onClick={() => setSelected(sale)}><FileText size={19} /><span><strong>{sale.id}</strong><small>{new Date(sale.createdAt).toLocaleString('th-TH')} · {sale.cashier}</small></span><strong>{money.format(sale.total)}</strong></button>)}{visible.length === 0 && <p className="muted">ไม่พบรายการ</p>}</div></section><section className="receipt">{selected ? <><div className="receipt-heading"><strong>RubTang POS</strong><small>สาขาสุขุมวิท</small><small>ใบเสร็จรับเงิน</small></div><div className="receipt-meta"><span>{selected.id}</span><span>{new Date(selected.createdAt).toLocaleString('th-TH')}</span><span>พนักงาน: {selected.cashier}</span></div>{selected.items.map(item => <div className="receipt-line" key={item.name}><span>{item.name} × {item.quantity}</span><strong>{money.format(item.price * item.quantity)}</strong></div>)}<div className="receipt-total"><span>ชำระด้วย {selected.payment}</span><strong>รวม {money.format(selected.total)}</strong></div><button className="secondary" onClick={() => window.print()}>พิมพ์ใบเสร็จตัวอย่าง</button></> : <div className="receipt-empty"><FileText size={32} /><p>เลือกรายการเพื่อดูใบเสร็จ</p></div>}</section></div>
    <p className="help">โหมดตัวอย่าง: ปุ่มพิมพ์จะเปิด print dialog ของเบราว์เซอร์ และไม่มีการแก้ไขสถานะบิล</p>
  </dialog>;
}
