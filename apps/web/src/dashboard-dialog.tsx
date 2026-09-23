import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  PackageSearch,
  TrendingUp,
  X,
} from 'lucide-react';
import { api, Branch, DashboardData } from './api';

const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

export function DashboardDialog({
  branch,
  close,
}: {
  branch: Branch;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', branch.id],
    queryFn: () => api<DashboardData>(`/dashboard?branchId=${branch.id}`),
    enabled: Boolean(branch.id),
  });

  const data = dashboardQuery.data;

  // Max sale amount for bar chart scaling
  const maxDaily = data?.dailySales
    ? Math.max(...data.dailySales.map((d) => d.amount), 100)
    : 100;

  // Payment totals
  const totalPayment = (data?.paymentBreakdown.cash ?? 0) + (data?.paymentBreakdown.transfer ?? 0);
  const cashPct = totalPayment > 0 ? Math.round(((data?.paymentBreakdown.cash ?? 0) / totalPayment) * 100) : 0;
  const transferPct = totalPayment > 0 ? 100 - cashPct : 0;

  // Growth vs yesterday
  let growthText = 'ยังไม่มีข้อมูลเมื่อวาน';
  if (data?.metrics.yesterdaySales !== undefined && data.metrics.yesterdaySales > 0) {
    const diff = data.metrics.todaySales - data.metrics.yesterdaySales;
    const pct = Math.round((diff / data.metrics.yesterdaySales) * 100);
    growthText = pct >= 0 ? `+${pct}% จากเมื่อวาน (${money.format(data.metrics.yesterdaySales)})` : `${pct}% จากเมื่อวาน (${money.format(data.metrics.yesterdaySales)})`;
  } else if (data?.metrics.todaySales && data.metrics.todaySales > 0) {
    growthText = 'เริ่มมียอดขายวันนี้';
  }

  const avgPerBill =
    data?.metrics.todayBills && data.metrics.todayBills > 0
      ? money.format(data.metrics.todaySales / data.metrics.todayBills)
      : '0 บาท';

  return (
    <dialog
      ref={dialog}
      className="modal dashboard-preview"
      aria-labelledby="dashboard-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">REALTIME ANALYTICS</span>
          <h2 id="dashboard-dialog-title">ภาพรวมและสถิติร้าน</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X />
        </button>
      </div>
      <p className="muted">
        สถิติยอดขายและสต็อกสินค้าของ {branch.name} คำนวณจากฐานข้อมูลจริง
      </p>

      {dashboardQuery.isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#8297b0' }}>
          <Loader2 size={32} className="spin" style={{ margin: 'auto', marginBottom: '12px' }} />
          กำลังประมวลผลข้อมูลสถิติ…
        </div>
      ) : dashboardQuery.isError ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#c23f45' }}>
          ไม่สามารถโหลดข้อมูลสถิติได้ กรุณาลองใหม่อีกครั้ง
        </div>
      ) : data ? (
        <>
          {/* 4 KPI Metric Cards */}
          <div className="metric-grid">
            <Metric
              icon={<TrendingUp size={20} />}
              label="ยอดขายวันนี้"
              value={money.format(data.metrics.todaySales)}
              detail={growthText}
            />
            <Metric
              icon={<FileText size={20} />}
              label="จำนวนบิลวันนี้"
              value={`${data.metrics.todayBills} บิล`}
              detail={`เฉลี่ย ${avgPerBill} / บิล`}
            />
            <Metric
              icon={<BarChart3 size={20} />}
              label="ยอดขายเดือนนี้"
              value={money.format(data.metrics.monthSales)}
              detail={`รวม ${data.metrics.monthBills} บิลในเดือนนี้`}
            />
            <Metric
              icon={<PackageSearch size={20} />}
              label="สินค้าใกล้หมด"
              value={`${data.metrics.lowStockCount} รายการ`}
              detail="สินค้าคงเหลือ 5 ชิ้นหรือน้อยกว่า"
            />
          </div>

          {/* Row 1: กราฟ 7 วัน & สินค้าขายดี */}
          <div className="dashboard-columns">
            <section className="dashboard-card">
              <h3>ยอดขาย 7 วันล่าสุด</h3>
              <div className="bar-chart">
                {data.dailySales.map((d, index) => {
                  const heightPct = Math.max(Math.round((d.amount / maxDaily) * 100), 6);
                  return (
                    <div className="bar-column" key={index}>
                      <span
                        style={{ height: `${heightPct}%` }}
                        title={`${d.dayLabel} (${d.date}): ${money.format(d.amount)}`}
                      />
                      <small>{d.dayLabel}</small>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', color: '#8297b0' }}>
                <span>{data.dailySales[0]?.date}</span>
                <span>{data.dailySales[data.dailySales.length - 1]?.date}</span>
              </div>
            </section>

            <section className="dashboard-card">
              <h3>5 อันดับสินค้าขายดี</h3>
              {data.topProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '35px 0', color: '#8297b0', fontSize: '13px' }}>
                  ยังไม่มีประวัติการขายสินค้าในระบบ
                </div>
              ) : (
                <ol className="rank-list">
                  {data.topProducts.map((p) => (
                    <li key={p.productId}>
                      <span>{p.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <strong>{p.quantity} ชิ้น</strong>
                        <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>
                          {money.format(p.revenue)}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Row 2: สัดส่วนการชำระเงิน & แจ้งเตือนสต็อกต่ำ */}
          <div className="dashboard-columns" style={{ marginTop: '14px' }}>
            <section className="dashboard-card">
              <h3>สัดส่วนการชำระเงินวันนี้</h3>
              {totalPayment === 0 ? (
                <div style={{ textAlign: 'center', padding: '35px 0', color: '#8297b0', fontSize: '13px' }}>
                  ยังไม่มียอดชำระเงินในวันนี้
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '14px', marginTop: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#163d70' }}>
                        <CreditCard size={15} color="#0877ee" /> เงินสด ({cashPct}%)
                      </span>
                      <strong>{money.format(data.paymentBreakdown.cash)}</strong>
                    </div>
                    <div style={{ height: '8px', background: '#eaf4ff', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${cashPct}%`, height: '100%', background: '#0877ee', borderRadius: '4px' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#163d70' }}>
                        <Landmark size={15} color="#16825d" /> โอนเงิน / QR ({transferPct}%)
                      </span>
                      <strong>{money.format(data.paymentBreakdown.transfer)}</strong>
                    </div>
                    <div style={{ height: '8px', background: '#eaf8ef', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${transferPct}%`, height: '100%', background: '#16825d', borderRadius: '4px' }} />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="dashboard-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={16} color="#e67d00" /> แจ้งเตือนสินค้าสต็อกต่ำ
              </h3>
              {data.lowStock.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '35px 0', color: '#16825d', fontSize: '13px' }}>
                  ✓ สต็อกสินค้าทุกรายการเพียงพอ (ไม่มีสินค้าต่ำกว่า 5 ชิ้น)
                </div>
              ) : (
                <ul className="low-stock">
                  {data.lowStock.map((item) => (
                    <li key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span>{item.name}</span>
                        <small style={{ display: 'block', color: '#8297b0', fontSize: '11px' }}>
                          SKU: {item.sku}
                        </small>
                      </div>
                      <strong style={{ color: '#c23f45', fontSize: '13px' }}>
                        คงเหลือ {item.quantity} ชิ้น
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
