import { FormEvent, useEffect, useRef, useState } from 'react';
import { ClipboardList, PackagePlus, Plus, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Status = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'COMPLETED';
type PurchaseOrder = { id: string; supplier: string; branch: string; product: string; quantity: number; received: number; status: Status };
const statusText: Record<Status, string> = { DRAFT: 'ร่าง', ORDERED: 'สั่งซื้อแล้ว', PARTIALLY_RECEIVED: 'รับแล้วบางส่วน', RECEIVED: 'รับครบแล้ว', COMPLETED: 'เสร็จสิ้น' };
const next: Record<Status, Status | null> = { DRAFT: 'ORDERED', ORDERED: 'PARTIALLY_RECEIVED', PARTIALLY_RECEIVED: 'RECEIVED', RECEIVED: 'COMPLETED', COMPLETED: null };

/** Mock purchase-order workflow. No supplier, document, or stock record is persisted. */
export function PurchaseOrderPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>(previewSeeds.purchaseOrders as PurchaseOrder[]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const input = new FormData(event.currentTarget); const quantity = Number(input.get('quantity')); if (!Number.isFinite(quantity) || quantity <= 0) return; setOrders(items => [{ id: `PO-${String(items.length + 22).padStart(5, '0')}`, supplier: String(input.get('supplier')), branch: String(input.get('branch')), product: String(input.get('product')), quantity, received: 0, status: 'DRAFT' }, ...items]); event.currentTarget.reset(); }
  function advance(id: string) { setOrders(items => items.map(order => { if (order.id !== id || !next[order.status]) return order; const status = next[order.status]!; return { ...order, status, received: status === 'PARTIALLY_RECEIVED' ? Math.ceil(order.quantity / 2) : status === 'RECEIVED' || status === 'COMPLETED' ? order.quantity : order.received }; })); }
  return <dialog ref={dialog} className="modal po-preview" aria-labelledby="po-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · PROCUREMENT</span><h2 id="po-preview-title">สั่งซื้อและรับสินค้า</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ตัวอย่าง Purchase Order และการรับสินค้าเข้าคลัง</p>
    <form className="po-form" onSubmit={create}><select name="supplier" aria-label="ผู้จำหน่าย"><option>ABC Trading</option><option>Fresh Supply</option></select><select name="branch" aria-label="สาขาปลายทาง"><option>สาขาสุขุมวิท</option><option>สาขาสยาม</option></select><select name="product" aria-label="สินค้า"><option>น้ำดื่ม 600 มล.</option><option>เมล็ดกาแฟคั่วกลาง</option><option>ถุงกระดาษ</option></select><input name="quantity" type="number" min="1" step="1" placeholder="จำนวน" required /><button className="primary"><Plus size={16} />สร้าง PO</button></form>
    <div className="po-list">{orders.map(order => <article key={order.id}><div className="po-heading"><ClipboardList size={20} /><span><strong>{order.id}</strong><small>{order.supplier} · ส่งที่ {order.branch}</small></span><span className="status">{statusText[order.status]}</span></div><div className="po-product"><span>{order.product}</span><strong>{order.received} / {order.quantity} หน่วย</strong></div><div className="receive-meter"><b style={{ width: `${(order.received / order.quantity) * 100}%` }} /></div>{next[order.status] && <button className="secondary" onClick={() => advance(order.id)}><PackagePlus size={16} />{order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED' ? 'บันทึกรับสินค้า' : `เปลี่ยนเป็น “${statusText[next[order.status]!]}”`}</button>}</article>)}</div><p className="help">โหมดตัวอย่าง: การรับสินค้าไม่เพิ่ม stock จริง และไม่มีเอกสารผู้จำหน่ายถูกบันทึก</p>
  </dialog>;
}
