import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { previewSeeds } from './preview-data';
import { AppSelect } from './components/app-select';

type Row = { date: string; bills: number; sales: number; cash: number; transfer: number };
const rows: Row[] = previewSeeds.reportRows;
const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

/** Browser-only reporting prototype. Exported CSV is built only from static mock rows. */
export function ReportsPreview({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState('7 วันล่าสุด');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const totals = useMemo(() => rows.reduce((sum, row) => ({ bills: sum.bills + row.bills, sales: sum.sales + row.sales, cash: sum.cash + row.cash, transfer: sum.transfer + row.transfer }), { bills: 0, sales: 0, cash: 0, transfer: 0 }), []);
  function exportCsv() {
    const header = 'วันที่,จำนวนบิล,ยอดขาย,เงินสด,โอนเงิน';
    const content = [header, ...rows.map(row => [row.date, row.bills, row.sales, row.cash, row.transfer].join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'rubtang-report-demo.csv'; link.click(); URL.revokeObjectURL(url);
  }
  return <dialog ref={dialog} className="modal reports-preview" aria-labelledby="reports-preview-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><div><span className="eyebrow green">MOCK DATA · REPORTS</span><h2 id="reports-preview-title">รายงานยอดขาย</h2></div><button className="icon-button" onClick={close} aria-label="ปิด"><X /></button></div>
    <div className="report-toolbar"><label>ช่วงเวลา<AppSelect value={range} onChange={event => setRange(event.target.value)}><option>วันนี้</option><option>7 วันล่าสุด</option><option>เดือนนี้</option></AppSelect></label><button className="secondary" onClick={exportCsv}><Download size={16} />Export CSV</button></div>
    <div className="report-summary"><div><small>ยอดขายรวม</small><strong>{money.format(totals.sales)}</strong></div><div><small>จำนวนบิล</small><strong>{totals.bills}</strong></div><div><small>ยอดเฉลี่ยต่อบิล</small><strong>{money.format(totals.sales / totals.bills)}</strong></div></div>
    <section className="report-card"><h3><FileSpreadsheet size={18} />ยอดขายตามวัน <small>· {range}</small></h3><div className="table-scroll"><table><thead><tr><th>วันที่</th><th className="numeric">จำนวนบิล</th><th className="numeric">ยอดขาย</th><th className="numeric">เงินสด</th><th className="numeric">โอนเงิน</th></tr></thead><tbody>{rows.map(row => <tr key={row.date}><td>{row.date}</td><td className="numeric">{row.bills}</td><td className="numeric">{money.format(row.sales)}</td><td className="numeric">{money.format(row.cash)}</td><td className="numeric">{money.format(row.transfer)}</td></tr>)}</tbody><tfoot><tr><th>รวม</th><th className="numeric">{totals.bills}</th><th className="numeric">{money.format(totals.sales)}</th><th className="numeric">{money.format(totals.cash)}</th><th className="numeric">{money.format(totals.transfer)}</th></tr></tfoot></table></div></section>
    <section className="report-card"><h3>สินค้าขายดี</h3><div className="product-report"><span>กาแฟอเมริกาโน่ <b style={{ width: '100%' }} /></span><strong>180 แก้ว</strong><span>น้ำดื่ม 600 มล. <b style={{ width: '72%' }} /></span><strong>130 ขวด</strong><span>ชาไทยเย็น <b style={{ width: '56%' }} /></span><strong>101 แก้ว</strong></div></section><p className="help">ข้อมูลตัวอย่างเท่านั้น; CSV ที่ดาวน์โหลดจะมีเฉพาะข้อมูล mock ชุดนี้</p>
  </dialog>;
}
