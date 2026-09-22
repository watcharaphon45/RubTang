import { FormEvent, useEffect, useRef, useState } from 'react';
import { BadgePercent, Check, Plus, Ticket, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Promotion = { id: number; name: string; type: 'เปอร์เซ็นต์' | 'จำนวนเงิน'; value: number; scope: string; active: boolean };
const initial: Promotion[] = previewSeeds.promotions as Promotion[];

/** Local promotion and coupon mock data for validating setup and cashier flows. */
export function PromotionPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [promotions, setPromotions] = useState(initial);
  const [coupon, setCoupon] = useState('');
  const [couponResult, setCouponResult] = useState<string>();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name') ?? '').trim(); const value = Number(data.get('value')); if (!name || !Number.isFinite(value) || value <= 0) return; setPromotions(items => [...items, { id: Date.now(), name, type: data.get('type') === 'จำนวนเงิน' ? 'จำนวนเงิน' : 'เปอร์เซ็นต์', value, scope: String(data.get('scope')), active: true }]); event.currentTarget.reset(); }
  function validateCoupon(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setCouponResult(coupon.trim().toUpperCase() === 'RUBTANG50' ? 'ใช้คูปองได้: ลด 50 บาท' : 'ไม่พบหรือคูปองหมดอายุ'); }
  return <dialog ref={dialog} className="modal promotion-preview" aria-labelledby="promotion-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · MARKETING</span><h2 id="promotion-preview-title">โปรโมชั่นและคูปอง</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ตั้งค่าเงื่อนไขตัวอย่างก่อนเชื่อมกติกาส่วนลดจริงใน checkout</p>
    <section className="promotion-section"><h3><BadgePercent size={18} />โปรโมชั่น</h3><div className="promotion-list">{promotions.map(item => <div key={item.id}><span><strong>{item.name}</strong><small>{item.scope} · ลด {item.value}{item.type === 'เปอร์เซ็นต์' ? '%' : ' บาท'}</small></span><button className={`toggle ${item.active ? 'on' : ''}`} onClick={() => setPromotions(items => items.map(promotion => promotion.id === item.id ? { ...promotion, active: !promotion.active } : promotion))} aria-label={`เปลี่ยนสถานะ ${item.name}`}><i /></button></div>)}</div><form className="promotion-form" onSubmit={create}><input name="name" maxLength={120} required placeholder="ชื่อโปรโมชั่น" /><select name="type" aria-label="ชนิดส่วนลด"><option>เปอร์เซ็นต์</option><option>จำนวนเงิน</option></select><input name="value" type="number" min="0.01" step="0.01" required placeholder="มูลค่าส่วนลด" /><select name="scope" aria-label="ขอบเขต"><option>ทุกสาขา</option><option>สาขาสุขุมวิท</option><option>สาขาสยาม</option></select><button className="secondary"><Plus size={16} />เพิ่มโปรโมชั่น</button></form></section>
    <section className="promotion-section"><h3><Ticket size={18} />ตรวจคูปองหน้าขาย</h3><form className="coupon-form" onSubmit={validateCoupon}><input value={coupon} onChange={event => setCoupon(event.target.value)} maxLength={40} placeholder="ลองใช้ RUBTANG50" aria-label="รหัสคูปอง" /><button className="primary">ตรวจคูปอง</button></form>{couponResult && <p className={`coupon-result ${couponResult.startsWith('ใช้') ? 'valid' : ''}`}>{couponResult.startsWith('ใช้') && <Check size={16} />}{couponResult}</p>}</section><p className="help">โหมดตัวอย่าง: ไม่มีการตรวจสิทธิ์ลูกค้า ยอดซื้อ หรือใช้คูปองจริง</p>
  </dialog>;
}
