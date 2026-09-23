import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CreditCard,
  Download,
  FileSpreadsheet,
  Landmark,
  Package,
  Printer,
  ShoppingBag,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  api,
  Branch,
  InventoryValuationData,
  Profile,
  SalesReportData,
  TopProductsReportData,
} from './api';
import { AppSelect } from './components/app-select';

const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
});

type DatePreset = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH' | 'CUSTOM';

export function ReportDialog({
  branch,
  profile,
  close,
}: {
  branch: Branch;
  profile: Profile;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  const [activeTab, setActiveTab] = useState<'sales' | 'products' | 'inventory'>('sales');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    profile.role === 'OWNER' ? '' : branch.id,
  );
  const [datePreset, setDatePreset] = useState<DatePreset>('LAST_7_DAYS');

  // Custom date range
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  function getDateRange() {
    const now = new Date();
    if (datePreset === 'TODAY') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: today.toISOString(), endDate: now.toISOString() };
    }
    if (datePreset === 'LAST_7_DAYS') {
      const past = new Date(now.getTime() - 7 * 86400000);
      return { startDate: past.toISOString(), endDate: now.toISOString() };
    }
    if (datePreset === 'LAST_30_DAYS') {
      const past = new Date(now.getTime() - 30 * 86400000);
      return { startDate: past.toISOString(), endDate: now.toISOString() };
    }
    if (datePreset === 'THIS_MONTH') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: first.toISOString(), endDate: now.toISOString() };
    }
    if (datePreset === 'CUSTOM') {
      return {
        startDate: customStart ? new Date(customStart).toISOString() : undefined,
        endDate: customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : undefined,
      };
    }
    return {};
  }

  const { startDate, endDate } = getDateRange();

  // Queries
  const salesReportQuery = useQuery({
    queryKey: ['report-sales', selectedBranchId, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api<SalesReportData>(`/reports/sales?${params.toString()}`);
    },
  });

  const productsReportQuery = useQuery({
    queryKey: ['report-products', selectedBranchId, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return api<TopProductsReportData>(`/reports/top-products?${params.toString()}`);
    },
    enabled: activeTab === 'products',
  });

  const inventoryValuationQuery = useQuery({
    queryKey: ['report-inventory', selectedBranchId || branch.id],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('branchId', selectedBranchId || branch.id);
      return api<InventoryValuationData>(`/reports/inventory-valuation?${params.toString()}`);
    },
    enabled: activeTab === 'inventory',
  });

  function exportSalesCsv() {
    const data = salesReportQuery.data;
    if (!data || data.rows.length === 0) {
      alert('ไม่มีข้อมูลยอดขายสำหรับดาวน์โหลด');
      return;
    }

    const headers = ['วันที่', 'จำนวนบิล', 'ยอดก่อนลด (บาท)', 'ส่วนลด (บาท)', 'ยอดสุทธิ (บาท)', 'เงินสด (บาท)', 'โอนเงิน (บาท)'];
    const lines = data.rows.map(r =>
      [
        r.date,
        r.bills,
        r.subtotal.toFixed(2),
        r.discount.toFixed(2),
        r.netSales.toFixed(2),
        r.cashSales.toFixed(2),
        r.transferSales.toFixed(2),
      ].join(','),
    );

    lines.push(
      [
        'รวมทั้งสิ้น',
        data.summary.totalBills,
        (data.summary.totalSales + data.summary.totalDiscount).toFixed(2),
        data.summary.totalDiscount.toFixed(2),
        data.summary.totalSales.toFixed(2),
        data.summary.totalCash.toFixed(2),
        data.summary.totalTransfer.toFixed(2),
      ].join(','),
    );

    const csvContent = '\ufeff' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubtang-sales-report-${datePreset.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportProductsCsv() {
    const data = productsReportQuery.data;
    if (!data || data.items.length === 0) {
      alert('ไม่มีข้อมูลสินค้าสำหรับดาวน์โหลด');
      return;
    }

    const headers = ['อันดับ', 'ชื่อสินค้า', 'SKU', 'จำนวนที่ขาย (ชิ้น)', 'ยอดขายรวม (บาท)', 'สัดส่วนยอดขาย (%)'];
    const lines = data.items.map((item, idx) =>
      [
        idx + 1,
        `"${item.name.replace(/"/g, '""')}"`,
        item.sku,
        item.quantitySold,
        item.revenue.toFixed(2),
        item.sharePercent + '%',
      ].join(','),
    );

    const csvContent = '\ufeff' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubtang-top-products.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const salesData = salesReportQuery.data;
  const productsData = productsReportQuery.data;
  const invData = inventoryValuationQuery.data;

  return (
    <dialog
      ref={dialog}
      className="modal reports-dialog"
      aria-labelledby="report-dialog-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
      style={{ maxWidth: '1060px', width: '96vw' }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">BUSINESS INTELLIGENCE · รายงานธุรกิจ</span>
          <h2 id="report-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={22} color="#0877ee" /> รายงานสรุปและการเงิน
          </h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      <p className="muted" style={{ margin: '-8px 0 16px 0', fontSize: '13px' }}>
        วิเคราะห์ยอดขายจริง, สินค้าขายดี, สรุปวิธีการชำระเงิน, และประเมินมูลค่าสินค้าคงคลัง พร้อมส่งออกไฟล์ Excel/CSV
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'sales' ? '2px solid #0877ee' : '2px solid transparent',
              color: activeTab === 'sales' ? '#0877ee' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <TrendingUp size={15} /> สรุปยอดขายตามวัน
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('products')}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'products' ? '2px solid #0877ee' : '2px solid transparent',
              color: activeTab === 'products' ? '#0877ee' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShoppingBag size={15} /> สินค้าขายดี
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'inventory' ? '2px solid #0877ee' : '2px solid transparent',
              color: activeTab === 'inventory' ? '#0877ee' : '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Boxes size={15} /> มูลค่าสต็อกคงเหลือ
          </button>
        </div>

        {/* Action buttons: Export CSV & Print */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (activeTab === 'sales') exportSalesCsv();
              else if (activeTab === 'products') exportProductsCsv();
              else alert('สามารถดูข้อมูลมูลค่าสต็อกคงเหลือได้ที่ตารางด้านล่าง');
            }}
            style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => window.print()}
            style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} /> พิมพ์รายงาน
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '16px',
        }}
      >
        {/* Branch Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>สาขา:</span>
          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            disabled={profile.role !== 'OWNER'}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
          >
            {profile.role === 'OWNER' && <option value="">ทุกสาขาในร้าน</option>}
            {profile.branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Date Presets (hide for inventory tab since inventory is current snapshot) */}
        {activeTab !== 'inventory' && (
          <>
            <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>ช่วงเวลา:</span>
              <select
                value={datePreset}
                onChange={e => setDatePreset(e.target.value as DatePreset)}
                style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="TODAY">วันนี้</option>
                <option value="LAST_7_DAYS">7 วันล่าสุด</option>
                <option value="LAST_30_DAYS">30 วันล่าสุด</option>
                <option value="THIS_MONTH">เดือนนี้</option>
                <option value="CUSTOM">กำหนดเอง</option>
              </select>
            </div>

            {datePreset === 'CUSTOM' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>ถึง</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* TAB 1: SALES REPORT */}
      {activeTab === 'sales' && (
        <div>
          {salesReportQuery.isLoading ? (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>กำลังประมวลผลข้อมูลยอดขาย...</p>
          ) : salesData ? (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: 600, display: 'block' }}>ยอดขายสุทธิ</small>
                  <strong style={{ fontSize: '18px', color: '#1e3a8a', display: 'block', marginTop: '2px' }}>
                    {money.format(salesData.summary.totalSales)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#60a5fa' }}>จาก {salesData.summary.totalBills} บิล</span>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#15803d', fontSize: '11px', fontWeight: 600, display: 'block' }}>เฉลี่ยต่อบิล (AOV)</small>
                  <strong style={{ fontSize: '18px', color: '#14532d', display: 'block', marginTop: '2px' }}>
                    {money.format(salesData.summary.averageOrderValue)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#4ade80' }}>ต่อ 1 รายการขาย</span>
                </div>

                <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#a16207', fontSize: '11px', fontWeight: 600, display: 'block' }}>ส่วนลดที่มอบให้</small>
                  <strong style={{ fontSize: '18px', color: '#713f12', display: 'block', marginTop: '2px' }}>
                    {money.format(salesData.summary.totalDiscount)}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#ca8a04' }}>โปรโมชัน & สมาชิก</span>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#475569', fontSize: '11px', fontWeight: 600, display: 'block' }}>สัดส่วนชำระเงิน</small>
                  <div style={{ fontSize: '12px', marginTop: '4px', color: '#334155' }}>
                    <div>สด: <strong>{money.format(salesData.summary.totalCash)}</strong></div>
                    <div>โอน: <strong>{money.format(salesData.summary.totalTransfer)}</strong></div>
                  </div>
                </div>
              </div>

              {/* Daily Rows Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>วันที่</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>จำนวนบิล</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>ยอดก่อนลด</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>ส่วนลด</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>ยอดขายสุทธิ</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>เงินสด</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>โอนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          ไม่มีรายการขายในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    ) : (
                      salesData.rows.map(row => (
                        <tr key={row.date} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{row.date}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.bills}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(row.subtotal)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: row.discount > 0 ? '#dc2626' : '#64748b' }}>
                            {row.discount > 0 ? `-${money.format(row.discount)}` : '0'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0877ee' }}>
                            {money.format(row.netSales)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(row.cashSales)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(row.transferSales)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {salesData.rows.length > 0 && (
                    <tfoot style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                      <tr>
                        <td style={{ padding: '8px 12px' }}>รวมทั้งสิ้น</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{salesData.summary.totalBills}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {money.format(salesData.summary.totalSales + salesData.summary.totalDiscount)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#dc2626' }}>
                          {money.format(salesData.summary.totalDiscount)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0877ee' }}>
                          {money.format(salesData.summary.totalSales)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(salesData.summary.totalCash)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(salesData.summary.totalTransfer)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>ไม่สามารถโหลดรายงานยอดขายได้</p>
          )}
        </div>
      )}

      {/* TAB 2: TOP PRODUCTS */}
      {activeTab === 'products' && (
        <div>
          {productsReportQuery.isLoading ? (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>กำลังประมวลผลสินค้าขายดี...</p>
          ) : productsData ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#475569' }}>
                  ยอดขายรวมของสินค้าทั้งหมด: <strong>{money.format(productsData.totalRevenue)}</strong>
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  จัดอันดับ {productsData.items.length} สินค้าแรก
                </span>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center', padding: '8px' }}>อันดับ</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>สินค้า</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: '120px' }}>จำนวนที่ขาย</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: '130px' }}>ยอดขาย (บาท)</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', width: '160px' }}>สัดส่วน (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsData.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          ไม่มีรายการสินค้าที่ขายได้ในช่วงเวลานี้
                        </td>
                      </tr>
                    ) : (
                      productsData.items.map((item, idx) => (
                        <tr key={item.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ textAlign: 'center', padding: '8px', fontWeight: 700, color: idx < 3 ? '#0877ee' : '#64748b' }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <strong style={{ display: 'block', color: '#1e293b' }}>{item.name}</strong>
                            <small style={{ color: '#64748b' }}>{item.sku}</small>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                            {item.quantitySold.toLocaleString()} ชิ้น
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0877ee' }}>
                            {money.format(item.revenue)}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, item.sharePercent)}%`,
                                    background: idx === 0 ? '#10b981' : '#0877ee',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '11px', color: '#64748b', minWidth: '35px' }}>
                                {item.sharePercent}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>ไม่สามารถโหลดรายงานสินค้าได้</p>
          )}
        </div>
      )}

      {/* TAB 3: INVENTORY VALUATION */}
      {activeTab === 'inventory' && (
        <div>
          {inventoryValuationQuery.isLoading ? (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>กำลังคำนวณมูลค่าสต็อกสินค้า...</p>
          ) : invData ? (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>จำนวนรายการสินค้า (SKUs)</small>
                  <strong style={{ fontSize: '18px', color: '#1e293b', display: 'block', marginTop: '2px' }}>
                    {invData.summary.totalSKUs} รายการ
                  </strong>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block' }}>จำนวนชิ้นคงคลังรวม</small>
                  <strong style={{ fontSize: '18px', color: '#1e293b', display: 'block', marginTop: '2px' }}>
                    {invData.summary.totalUnits.toLocaleString()} ชิ้น
                  </strong>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: 600, display: 'block' }}>มูลค่าประเมินสต็อก (ราคาขาย)</small>
                  <strong style={{ fontSize: '18px', color: '#1e3a8a', display: 'block', marginTop: '2px' }}>
                    {money.format(invData.summary.totalValuation)}
                  </strong>
                </div>

                <div style={{ background: invData.summary.lowStockCount > 0 ? '#fffbeb' : '#f8fafc', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px 14px' }}>
                  <small style={{ color: '#b45309', fontSize: '11px', fontWeight: 600, display: 'block' }}>สินค้าใกล้หมด / สินค้าหมด</small>
                  <strong style={{ fontSize: '18px', color: '#92400e', display: 'block', marginTop: '2px' }}>
                    {invData.summary.lowStockCount} / {invData.summary.outOfStockCount}
                  </strong>
                  <span style={{ fontSize: '10px', color: '#d97706' }}>ควรเติมสต็อก</span>
                </div>
              </div>

              {/* Inventory Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>สินค้า</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>สาขา</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>คงเหลือ</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>ราคาขาย</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>มูลค่ารวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invData.items.map(item => (
                      <tr key={`${item.branchId}-${item.productId}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <strong style={{ display: 'block', color: '#1e293b' }}>{item.productName}</strong>
                          <small style={{ color: '#64748b' }}>{item.sku}</small>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#475569' }}>{item.branchName}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              color: item.quantity <= 0 ? '#dc2626' : item.quantity <= 5 ? '#f59e0b' : '#10b981',
                            }}
                          >
                            {item.quantity.toLocaleString()} ชิ้น
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{money.format(item.unitPrice)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0877ee' }}>
                          {money.format(item.valuation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ padding: '30px', textAlign: 'center' }}>ไม่สามารถโหลดรายงานสต็อกได้</p>
          )}
        </div>
      )}
    </dialog>
  );
}
