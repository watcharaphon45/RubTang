import { useEffect, useRef } from 'react';
import { BarChart3, FileText, PackageSearch, TrendingUp, X } from 'lucide-react';
import { previewSeeds } from './preview-data';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
const { dashboard } = previewSeeds;

/** Static owner dashboard for visual and interaction validation before reporting APIs exist. */
export function DashboardPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="modal dashboard-preview" aria-labelledby="dashboard-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · OWNER DASHBOARD</span><h2 id="dashboard-preview-title">ภาพรวมร้าน</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>
    <p className="muted">ข้อมูลตัวอย่างของทุกสาขา ณ วันนี้ · 22 กันยายน 2569</p>
    <div className="metric-grid"><Metric icon={<TrendingUp />} label="ยอดขายวันนี้" value={money.format(dashboard.metrics.today)} detail="เพิ่มขึ้น 12.4% จากเมื่อวาน" /><Metric icon={<FileText />} label="จำนวนบิล" value={String(dashboard.metrics.bills)} detail="เฉลี่ย 67.10 บาท / บิล" /><Metric icon={<BarChart3 />} label="ยอดขายเดือนนี้" value={money.format(dashboard.metrics.month)} detail="เป้าหมายเดือนละ 350,000 บาท" /><Metric icon={<PackageSearch />} label="สินค้าใกล้หมด" value={`${dashboard.metrics.lowStock} รายการ`} detail="ต้องตรวจรับหรือปรับสต็อก" /></div>
    <div className="dashboard-columns"><section className="dashboard-card"><h3>ยอดขาย 7 วันล่าสุด</h3><div className="bar-chart">{dashboard.dailySales.map((value, index) => <div className="bar-column" key={index}><span style={{ height: `${value}%` }} title={`${value}%`} /><small>{['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'][index]}</small></div>)}</div><p className="muted small">ข้อมูลตัวอย่าง</p></section><section className="dashboard-card"><h3>สินค้าขายดี</h3><ol className="rank-list">{dashboard.topProducts.map(([name, quantity]) => <li key={name}><span>{name}</span><strong>{quantity}</strong></li>)}</ol></section></div>
    <div className="dashboard-columns"><section className="dashboard-card"><h3>เปรียบเทียบสาขา</h3><div className="comparison">{dashboard.branches.map(([name, sales, width]) => <div key={name}><span>{name}</span><strong>{money.format(Number(sales))}</strong><i><b style={{ width: `${Number(width)}%` }} /></i></div>)}</div></section><section className="dashboard-card"><h3>แจ้งเตือนสต็อกต่ำ</h3><ul className="low-stock">{dashboard.lowStock.map(([name, quantity]) => <li key={name}><span>{name}</span><strong>{quantity}</strong></li>)}</ul></section></div>
    <p className="help">โหมดตัวอย่าง: ตัวเลข กราฟ และรายการทั้งหมดเป็น mock data</p>
  </dialog>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <section className="metric"><span>{icon}</span><small>{label}</small><strong>{value}</strong><p>{detail}</p></section>;
}
