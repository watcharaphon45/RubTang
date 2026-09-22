import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, PackageCheck, Plus, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Status = 'DRAFT' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'COMPLETED';
type Transfer = { id: string; from: string; to: string; product: string; quantity: number; status: Status };
const labels: Record<Status, string> = { DRAFT: 'ร่าง', APPROVED: 'อนุมัติ', IN_TRANSIT: 'กำลังขนส่ง', RECEIVED: 'รับสินค้าแล้ว', COMPLETED: 'เสร็จสิ้น' };
const order: Status[] = ['DRAFT', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'COMPLETED'];

/** Local-only transfer state to validate the operational workflow before stock transactions are connected. */
export function TransferPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [transfers, setTransfers] = useState<Transfer[]>(previewSeeds.transfers as Transfer[]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const quantity = Number(values.get('quantity'));
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setTransfers(items => [{ id: `TR-${String(items.length + 13).padStart(5, '0')}`, from: String(values.get('from')), to: String(values.get('to')), product: String(values.get('product')), quantity, status: 'DRAFT' }, ...items]); event.currentTarget.reset();
  }
  function advance(id: string) { setTransfers(items => items.map(item => item.id === id ? { ...item, status: order[Math.min(order.indexOf(item.status) + 1, order.length - 1)] } : item)); }
  return <dialog ref={dialog} className="modal transfer-preview" aria-labelledby="transfer-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · INVENTORY</span><h2 id="transfer-preview-title">โอนสต็อกระหว่างสาขา</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>
    <p className="muted">จำลองการส่งสินค้าโดยยังไม่เปลี่ยนยอดคงเหลือจริง</p>
    <form className="transfer-form" onSubmit={create}><select name="from" aria-label="สาขาต้นทาง" defaultValue="สาขาสุขุมวิท"><option>สาขาสุขุมวิท</option><option>สาขาสยาม</option></select><ArrowRight size={18} /><select name="to" aria-label="สาขาปลายทาง" defaultValue="สาขาสยาม"><option>สาขาสยาม</option><option>สาขาสุขุมวิท</option></select><select name="product" aria-label="สินค้า"><option>น้ำดื่ม 600 มล.</option><option>กาแฟอเมริกาโน่</option><option>ถุงกระดาษ</option></select><input name="quantity" type="number" min="1" step="1" required placeholder="จำนวน" /><button className="primary"><Plus size={16} />สร้างรายการโอน</button></form>
    <div className="transfer-list">{transfers.map(item => <article key={item.id}><div className="transfer-title"><PackageCheck size={20} /><span><strong>{item.id}</strong><small>{item.product} · {item.quantity} หน่วย</small></span><span className="status">{labels[item.status]}</span></div><div className="transfer-route"><span>{item.from}</span><i /><span>{item.to}</span></div><div className="transfer-steps">{order.map(status => <span className={order.indexOf(status) <= order.indexOf(item.status) ? 'done' : ''} key={status}><b>{order.indexOf(status) < order.indexOf(item.status) ? <Check size={12} /> : order.indexOf(status) + 1}</b>{labels[status]}</span>)}</div>{item.status !== 'COMPLETED' && <button className="secondary" onClick={() => advance(item.id)}>เปลี่ยนเป็น “{labels[order[order.indexOf(item.status) + 1]]}”</button>}</article>)}</div><p className="help">โหมดตัวอย่าง: ในระบบจริงจะต้องตรวจสิทธิ์และตัด/เพิ่มสต็อกเป็น transaction เดียวตามสถานะ</p>
  </dialog>;
}
