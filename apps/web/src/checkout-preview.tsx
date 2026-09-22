import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgePercent, Check, CreditCard, Landmark, Minus, Plus, Search, ShoppingCart, Ticket, UserRound, X } from 'lucide-react';
import { AppSelect } from './components/app-select';
import { previewSeeds } from './preview-data';

type Item = { id: string; name: string; sku: string; price: number; stock: number };
type CartLine = Item & { quantity: number };
const inventory: Item[] = previewSeeds.checkoutItems;
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

/** Checkout UI prototype with local data only; no sale or inventory is persisted. */
export function CheckoutPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [received, setReceived] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [benefit, setBenefit] = useState<'MEMBER_10' | 'COUPON_50'>();
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [transferReference, setTransferReference] = useState('');
  const [completed, setCompleted] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const visibleItems = inventory.filter(item => !query || `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase()));
  const normalizedCustomerQuery = customerQuery.replaceAll('-', '').trim();
  const customer = normalizedCustomerQuery ? previewSeeds.customers.find(item => `${item.name} ${item.phone}`.replaceAll('-', '').includes(normalizedCustomerQuery)) : undefined;
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const manualDiscount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const benefitDiscount = benefit === 'MEMBER_10' ? subtotal * 0.1 : benefit === 'COUPON_50' ? 50 : 0;
  const discountValue = Math.min(manualDiscount + benefitDiscount, subtotal);
  const total = subtotal - discountValue;
  const change = Math.max((Number(received) || 0) - total, 0);
  function add(item: Item) { setCart(lines => { const line = lines.find(value => value.id === item.id); if (!line) return [...lines, { ...item, quantity: 1 }]; return lines.map(value => value.id === item.id ? { ...value, quantity: Math.min(value.quantity + 1, item.stock) } : value); }); }
  function adjust(id: string, delta: number) { setCart(lines => lines.flatMap(line => { const quantity = line.quantity + delta; return quantity <= 0 ? [] : [{ ...line, quantity: Math.min(quantity, line.stock) }]; })); }
  const canPay = cart.length > 0 && (paymentMethod === 'CASH' ? Number(received) >= total : transferReference.trim().length >= 4);
  const receipt = useMemo(() => `DEMO-${String(Date.now()).slice(-6)}`, [completed]);
  return <dialog ref={dialog} className="modal checkout-preview" aria-labelledby="checkout-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · POS</span><h2 id="checkout-preview-title">หน้าขายสินค้า</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>
    {completed ? <div className="checkout-complete"><CreditCard size={38} /><h3>ชำระเงินสำเร็จ (ตัวอย่าง)</h3><p>เลขที่ใบเสร็จ {receipt}<br />ยอดชำระ {money.format(total)}{paymentMethod === 'CASH' ? ` · เงินทอน ${money.format(change)}` : ' · โอนเงิน'}</p><button className="primary" onClick={() => { setCart([]); setDiscount('0'); setReceived(''); setCustomerQuery(''); setBenefit(undefined); setTransferReference(''); setPaymentMethod('CASH'); setCompleted(false); }}>เริ่มรายการใหม่</button></div> : <div className="checkout-grid"><section><div className="search checkout-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อสินค้า หรือ SKU" aria-label="ค้นหาสินค้า" /></div><div className="pos-products">{visibleItems.map(item => <button key={item.id} className="pos-product" onClick={() => add(item)}><strong>{item.name}</strong><small>{item.sku} · คงเหลือ {item.stock}</small><span>{money.format(item.price)}</span></button>)}</div></section><section className="cart"><h3><ShoppingCart size={18} />ตะกร้าสินค้า</h3><label className="checkout-customer"><span><UserRound size={16} />ลูกค้า (รหัสหรือเบอร์โทร)</span><input value={customerQuery} onChange={event => { setCustomerQuery(event.target.value); setBenefit(undefined); }} placeholder="เช่น 081-234-5678" aria-label="รหัสหรือเบอร์โทรลูกค้า" />{customerQuery && <small className={customer ? 'customer-found' : 'customer-missing'}>{customer ? `${customer.name} · ${customer.points} คะแนน` : 'ไม่พบลูกค้า — ขายแบบลูกค้าทั่วไปได้'}</small>}</label>{customer && <section className="checkout-benefits"><strong>สิทธิ์ของ {customer.name}</strong><div><button className={benefit === 'MEMBER_10' ? 'selected' : ''} onClick={() => setBenefit(value => value === 'MEMBER_10' ? undefined : 'MEMBER_10')}><BadgePercent size={16} /><span>สมาชิก ลด 10%<small>ลด {money.format(subtotal * .1)}</small></span>{benefit === 'MEMBER_10' && <Check size={16} />}</button>{customer.coupon && <button className={benefit === 'COUPON_50' ? 'selected' : ''} onClick={() => setBenefit(value => value === 'COUPON_50' ? undefined : 'COUPON_50')}><Ticket size={16} /><span>{customer.coupon}<small>ใช้ได้ 1 รายการ</small></span>{benefit === 'COUPON_50' && <Check size={16} />}</button>}</div><small>เลือกใช้ได้ 1 สิทธิ์ต่อรายการ</small></section>}{cart.length === 0 ? <p className="muted">เลือกสินค้าจากรายการด้านซ้าย</p> : <>{cart.map(item => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><small>{money.format(item.price)} / ชิ้น</small></div><div className="quantity-controls"><button onClick={() => adjust(item.id, -1)} aria-label={`ลด ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => adjust(item.id, 1)} disabled={item.quantity >= item.stock} aria-label={`เพิ่ม ${item.name}`}><Plus size={14} /></button></div><strong>{money.format(item.price * item.quantity)}</strong></div>)}<div className="checkout-totals"><label>ส่วนลด (บาท)<input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} /></label><div><span>รวมสินค้า</span><strong>{money.format(subtotal)}</strong></div><div><span>ส่วนลด</span><strong>-{money.format(discountValue)}</strong></div><div className="grand-total"><span>ยอดชำระ</span><strong>{money.format(total)}</strong></div><label>วิธีชำระเงิน<AppSelect icon={paymentMethod === 'TRANSFER' ? <Landmark size={16} /> : <CreditCard size={16} />} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน / QR</option></AppSelect></label>{paymentMethod === 'CASH' ? <><label>รับเงินสด<input type="number" min={total} step="0.01" value={received} onChange={event => setReceived(event.target.value)} placeholder="0.00" /></label>{Number(received) > 0 && <div><span>เงินทอน</span><strong>{money.format(change)}</strong></div>}</> : <section className="transfer-payment"><strong><Landmark size={16} />โอนเงิน / QR (ตัวอย่าง)</strong><span>ธนาคาร RubTang Demo · 123-4-56789-0</span><label>เลขอ้างอิงหรือเวลาโอน<input value={transferReference} onChange={event => setTransferReference(event.target.value)} maxLength={50} placeholder="เช่น 10:35 หรือ Ref. 123456" /></label></section>}<button className="primary" disabled={!canPay} onClick={() => setCompleted(true)}>{paymentMethod === 'CASH' ? 'ชำระเงินสด' : 'ยืนยันการโอนเงิน'}</button></div></>}</section></div>}
    <p className="help">โหมดตัวอย่าง: ยังไม่ตัดสต็อก บันทึกการขาย หรือสร้างใบเสร็จจริง</p>
  </dialog>;
}
