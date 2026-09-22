import { FormEvent, useEffect, useRef, useState } from 'react';
import { Calculator, CircleDollarSign, LockKeyhole, UnlockKeyhole, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

/** In-memory cash-drawer workflow. It never creates a shift or cash transaction in the backend. */
export function ShiftPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState<number>();
  const [counted, setCounted] = useState('');
  const [closed, setClosed] = useState(false);
  const cashSales = previewSeeds.shift.cashSales;
  const expected = (opening ?? 0) + cashSales;
  const difference = (Number(counted) || 0) - expected;
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function open(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const amount = Number(new FormData(event.currentTarget).get('opening')); if (!Number.isFinite(amount) || amount < 0) return; setOpening(amount); }
  if (opening === undefined) return <dialog ref={dialog} className="modal shift-preview" aria-labelledby="shift-preview-title" onCancel={event => { event.preventDefault(); close(); }}><div className="section-heading"><div><span className="eyebrow green">MOCK DATA · CASH DRAWER</span><h2 id="shift-preview-title">เปิดกะงาน</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><div className="shift-start"><UnlockKeyhole size={36} /><p>กำหนดเงินทอนตั้งต้นก่อนเริ่มรับชำระเงินสด</p><form onSubmit={open}><label>เงินทอนตั้งต้น (บาท)<input name="opening" type="number" min="0" step="0.01" autoFocus required placeholder="เช่น 1,000.00" /></label><button className="primary">เปิดกะงาน</button></form></div><p className="help">โหมดตัวอย่าง: ไม่มีการสร้างกะหรือบันทึกเงินสดจริง</p></dialog>;
  return <dialog ref={dialog} className="modal shift-preview" aria-labelledby="shift-preview-title" onCancel={event => { event.preventDefault(); close(); }}><div className="section-heading"><div><span className="eyebrow green">MOCK DATA · CASH DRAWER</span><h2 id="shift-preview-title">{closed ? 'สรุปปิดกะ' : 'กะงานปัจจุบัน'}</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>{closed ? <div className="shift-closed"><LockKeyhole size={36} /><h3>ปิดกะเรียบร้อย (ตัวอย่าง)</h3><p>เงินที่คาดไว้ {money.format(expected)}<br />เงินที่นับได้ {money.format(Number(counted))}<br /><strong className={difference === 0 ? 'balanced' : 'unbalanced'}>{difference === 0 ? 'ยอดเงินตรงกัน' : `ส่วนต่าง ${money.format(difference)}`}</strong></p><button className="secondary" onClick={() => { setOpening(undefined); setCounted(''); setClosed(false); }}>เริ่มกะใหม่</button></div> : <><div className="shift-metrics"><div><CircleDollarSign size={20} /><small>เงินทอนตั้งต้น</small><strong>{money.format(opening)}</strong></div><div><Calculator size={20} /><small>ยอดขายเงินสด</small><strong>{money.format(cashSales)}</strong></div><div><CircleDollarSign size={20} /><small>เงินที่ควรมี</small><strong>{money.format(expected)}</strong></div></div><section className="close-shift"><h3>นับเงินสดเพื่อปิดกะ</h3><label>เงินสดที่นับได้ (บาท)<input type="number" min="0" step="0.01" value={counted} onChange={event => setCounted(event.target.value)} placeholder="0.00" /></label>{counted && <p className={difference === 0 ? 'balanced' : 'unbalanced'}>{difference === 0 ? 'ยอดเงินตรงกัน' : `ส่วนต่าง ${money.format(difference)}`}</p>}<button className="primary" disabled={!counted} onClick={() => setClosed(true)}>ปิดกะงาน</button></section></>}<p className="help">ตัวเลขยอดขายเป็น mock data และไม่เกี่ยวข้องกับรายการขายตัวอย่างอื่น</p></dialog>;
}
