import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Link2, MessageCircle, ReceiptText, Send, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

/** UI-only LINE OA and e-receipt flow; no credentials or network requests are made. */
export function LinePreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [connected, setConnected] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function connect(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setConnected(true); }
  return <dialog ref={dialog} className="modal line-preview" aria-labelledby="line-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · LINE OA</span><h2 id="line-preview-title">LINE OA และ E‑Receipt</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ตัวอย่างหน้าจอเชื่อม LINE OA และส่งใบเสร็จอิเล็กทรอนิกส์</p>
    {!connected ? <section className="line-connect"><MessageCircle size={40} /><h3>เชื่อม LINE OA ของร้าน</h3><p>กรอกชื่อบัญชีเพื่อดู flow การเชื่อมต่อเท่านั้น<br />จะไม่มี token หรือข้อมูลใดถูกส่งออกจากเบราว์เซอร์</p><form onSubmit={connect}><label>ชื่อบัญชี LINE OA<input required maxLength={100} defaultValue={previewSeeds.line.accountName} /></label><button className="primary"><Link2 size={17} />เชื่อมต่อแบบตัวอย่าง</button></form></section> : sent ? <section className="line-connect line-success"><Check size={40} /><h3>ส่ง E‑Receipt แล้ว (ตัวอย่าง)</h3><p>ข้อความและลิงก์ใบเสร็จจะปรากฏกับลูกค้า “{previewSeeds.line.customers[0].split(' · ')[0]}”<br />เฉพาะใน flow จำลองนี้ ไม่มีข้อความถูกส่งจริง</p><button className="secondary" onClick={() => setSent(false)}>ส่งรายการอื่น</button></section> : <section className="line-send"><div className="line-status"><span><Check size={15} />เชื่อมต่อแล้ว</span><button className="text-button" onClick={() => setConnected(false)}>ยกเลิกการเชื่อมต่อ</button></div><label>ลูกค้า<select>{previewSeeds.line.customers.map(value => <option key={value}>{value}</option>)}</select></label><label>ใบเสร็จ<select>{previewSeeds.line.receipts.map(value => <option key={value}>{value}</option>)}</select></label><div className="receipt-message"><ReceiptText size={19} /><span><strong>RubTang POS</strong><small>ขอบคุณที่ใช้บริการ นี่คือใบเสร็จอิเล็กทรอนิกส์ของคุณ</small></span></div><button className="primary" onClick={() => setSent(true)}><Send size={16} />ส่ง E‑Receipt ตัวอย่าง</button></section>}<p className="help">โหมดตัวอย่าง: การเชื่อมต่อ, LIFF, webhook และการส่งข้อความจริงต้องทำหลังจากกำหนด credential และนโยบายข้อมูลส่วนบุคคล</p>
  </dialog>;
}
