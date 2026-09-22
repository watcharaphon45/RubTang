import { useEffect, useRef, useState } from 'react';
import { Check, CreditCard, Store, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

type Plan = 'Starter' | 'Business' | 'Pro';
const plans: { name: Plan; price: string; branches: string; features: string[] }[] = previewSeeds.plans as { name: Plan; price: string; branches: string; features: string[] }[];

/** SaaS plan-selection mock. It makes no billing request and does not change an entitlement. */
export function SubscriptionPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<Plan>('Starter');
  const [notice, setNotice] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const activePlan = plans.find(plan => plan.name === active)!;
  return <dialog ref={dialog} className="modal subscription-preview" aria-labelledby="subscription-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · RUBTANG SAAS</span><h2 id="subscription-preview-title">แพ็กเกจและการใช้งาน</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div><p className="muted">ตัวอย่างหน้าสำหรับเจ้าของร้านจัดการแผนบริการ</p>
    <section className="usage-card"><div><small>แพ็กเกจปัจจุบัน</small><strong>{activePlan.name}</strong><span>{activePlan.price}</span></div><div><Store size={22} /><small>สาขาที่ใช้</small><strong>1 / {activePlan.branches === '1 สาขา' ? '1' : activePlan.branches === '3 สาขา' ? '3' : '∞'}</strong></div><div><CreditCard size={22} /><small>วันต่ออายุ</small><strong>22 ต.ค. 2569</strong></div></section>{notice && <p className="subscription-notice"><Check size={16} />{notice}</p>}
    <div className="plan-grid">{plans.map(plan => <article key={plan.name} className={plan.name === active ? 'current' : ''}><span className="plan-name">{plan.name}</span><strong>{plan.price}</strong><small>{plan.branches}</small><ul>{plan.features.map(feature => <li key={feature}><Check size={14} />{feature}</li>)}</ul><button className={plan.name === active ? 'secondary' : 'primary'} disabled={plan.name === active} onClick={() => { setActive(plan.name); setNotice(`เลือกแพ็กเกจ ${plan.name} ในโหมดตัวอย่างแล้ว`); }}>{plan.name === active ? 'แพ็กเกจปัจจุบัน' : 'เลือกแพ็กเกจนี้'}</button></article>)}</div><p className="help">โหมดตัวอย่าง: ไม่สร้าง subscription, invoice หรือการตัดเงินใด ๆ</p>
  </dialog>;
}
