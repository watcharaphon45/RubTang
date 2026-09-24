import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpDown,
  Award,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  Landmark,
  Layers,
  Package,
  Printer,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  ShoppingBag,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  api,
  Branch,
  getStockCardReport,
  getVatSalesReport,
  InventoryValuationData,
  Product,
  Profile,
  SalesReportData,
  StockCardReportData,
  TopProductsReportData,
  VatSalesReportData,
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

  const [activeTab, setActiveTab] = useState<'sales' | 'products' | 'inventory' | 'vat' | 'stock-card'>('sales');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    profile.role === 'OWNER' ? '' : branch.id,
  );
  const [selectedProductId, setSelectedProductId] = useState<string>('');
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

  const vatReportQuery = useQuery({
    queryKey: ['report-vat', selectedBranchId, startDate, endDate],
    queryFn: () => getVatSalesReport({ branchId: selectedBranchId || undefined, startDate, endDate }),
    enabled: activeTab === 'vat',
  });

  const stockCardReportQuery = useQuery({
    queryKey: ['report-stock-card', selectedBranchId, selectedProductId, startDate, endDate],
    queryFn: () =>
      getStockCardReport({
        branchId: selectedBranchId || branch.id,
        productId: selectedProductId || undefined,
        startDate,
        endDate,
        limit: 200,
      }),
    enabled: activeTab === 'stock-card',
  });

  const productsListQuery = useQuery({
    queryKey: ['products-list-for-report', branch.id],
    queryFn: () => api<Product[]>(`/products?branchId=${branch.id}`),
    enabled: activeTab === 'stock-card',
  });

  function exportInventoryCsv() {
    const data = inventoryValuationQuery.data;
    if (!data || data.items.length === 0) {
      alert('ไม่มีข้อมูลสต็อกสำหรับดาวน์โหลด');
      return;
    }

    const headers = ['ชื่อสินค้า', 'SKU', 'บาร์โค้ด', 'สาขา', 'คงเหลือ (ชิ้น)', 'ราคาต่อหน่วย (บาท)', 'มูลค่ารวม (บาท)'];
    const lines = data.items.map(item =>
      [
        `"${item.productName.replace(/"/g, '""')}"`,
        item.sku,
        item.barcode || '-',
        item.branchName,
        item.quantity,
        item.unitPrice.toFixed(2),
        item.valuation.toFixed(2),
      ].join(','),
    );

    lines.push(
      [
        'รวมทั้งสิ้น',
        `${data.summary.totalSKUs} รายการ`,
        '-',
        '-',
        data.summary.totalUnits,
        '-',
        data.summary.totalValuation.toFixed(2),
      ].join(','),
    );

    const csvContent = '\ufeff' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubtang-inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportVatCsv() {
    const data = vatReportQuery.data;
    if (!data || data.items.length === 0) {
      alert('ไม่มีข้อมูลภาษีขายสำหรับดาวน์โหลด');
      return;
    }

    const headers = [
      'ลำดับ',
      'วันที่-เวลา',
      'เลขที่ใบกำกับ/ใบเสร็จ',
      'ประเภทเอกสาร',
      'ชื่อผู้ซื้อ/ลูกค้า',
      'เลขประจำตัวผู้เสียภาษี',
      'สถานประกอบการ',
      'มูลค่าสินค้า (ฐานภาษี)',
      'ภาษีมูลค่าเพิ่ม 7%',
      'จำนวนเงินรวม',
    ];

    const lines = data.items.map((item, idx) =>
      [
        idx + 1,
        new Date(item.createdAt).toLocaleString('th-TH'),
        item.documentNumber,
        item.invoiceType === 'FULL' ? 'ใบกำกับภาษีเต็มรูป' : 'ใบกำกับภาษีอย่างย่อ',
        `"${item.customerName.replace(/"/g, '""')}"`,
        item.customerTaxId,
        item.customerBranch,
        item.taxableAmount.toFixed(2),
        item.vatAmount.toFixed(2),
        item.totalAmount.toFixed(2),
      ].join(','),
    );

    lines.push(
      [
        'รวมทั้งสิ้น',
        '-',
        `${data.summary.totalSalesCount} บิล`,
        `เต็มรูป ${data.summary.fullInvoiceCount} / อย่างย่อ ${data.summary.abbCount}`,
        '-',
        '-',
        '-',
        data.summary.totalTaxableBase.toFixed(2),
        data.summary.totalOutputVat.toFixed(2),
        data.summary.totalGrossSales.toFixed(2),
      ].join(','),
    );

    const csvContent = '\ufeff' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubtang-vat-report-pp30-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportStockCardCsv() {
    const data = stockCardReportQuery.data;
    if (!data || data.items.length === 0) {
      alert('ไม่มีข้อมูลความเคลื่อนไหวสต็อกสำหรับดาวน์โหลด');
      return;
    }

    const headers = [
      'ลำดับ',
      'วันที่-เวลา',
      'สาขา',
      'สินค้า',
      'SKU',
      'บาร์โค้ด',
      'ประเภทการเคลื่อนไหว',
      'จำนวนที่เปลี่ยน',
      'ยอดคงเหลือก่อนหน้า',
      'ยอดคงเหลือหลังทำรายการ',
      'ผู้บันทึก',
      'หมายเหตุ',
    ];

    const lines = data.items.map((item, idx) =>
      [
        idx + 1,
        new Date(item.createdAt).toLocaleString('th-TH'),
        item.branchName,
        `"${item.productName.replace(/"/g, '""')}"`,
        item.sku,
        item.barcode,
        item.type,
        item.quantity,
        item.balanceBefore,
        item.balanceAfter,
        item.actorName,
        `"${(item.note || '').replace(/"/g, '""')}"`,
      ].join(','),
    );

    const csvContent = '\ufeff' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubtang-stock-card-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSalesCsv() {
    const data = salesReportQuery.data;
    if (!data || data.rows.length === 0) {
      alert('ไม่มีข้อมูลยอดขายสำหรับดาวน์โหลด');
      return;
    }

    const headers = ['วันที่', 'จำนวนบิล', 'ยอดก่อนลด (บาท)', 'ส่วนลด (บาท)', 'ยอดขายสุทธิ (บาท)', 'เงินสด (บาท)', 'โอนเงิน (บาท)'];
    const lines = data.rows.map(row =>
      [
        row.date,
        row.bills,
        row.subtotal.toFixed(2),
        row.discount.toFixed(2),
        row.netSales.toFixed(2),
        row.cashSales.toFixed(2),
        row.transferSales.toFixed(2),
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
      style={{ maxWidth: '1100px', width: '96vw', padding: '24px 28px' }}
    >
      {/* Header */}
      <div className="section-heading" style={{ marginBottom: '8px' }}>
        <div>
          <span className="eyebrow green">BUSINESS INTELLIGENCE · รายงานธุรกิจ</span>
          <h2 id="report-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 0' }}>
            <FileSpreadsheet size={22} color="#0877ee" /> รายงานสรุปและการเงิน
          </h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="ปิด">
          <X size={20} />
        </button>
      </div>

      <p className="muted" style={{ margin: '0 0 18px 0', fontSize: '13px' }}>
        วิเคราะห์ยอดขายจริง, สินค้าขายดี, สรุปวิธีการชำระเงิน, และประเมินมูลค่าสินค้าคงคลัง พร้อมส่งออกไฟล์ Excel/CSV
      </p>

      {/* Modern Segmented Tab Switcher */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #dce7f6',
          marginBottom: '16px',
          paddingBottom: '10px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'sales', label: 'สรุปยอดขาย', icon: <TrendingUp size={15} /> },
            { id: 'products', label: 'สินค้าขายดี', icon: <ShoppingBag size={15} /> },
            { id: 'inventory', label: 'มูลค่าสต็อกคงเหลือ', icon: <Boxes size={15} /> },
            { id: 'vat', label: 'ภาษีขาย (ภ.พ.30)', icon: <Receipt size={15} /> },
            { id: 'stock-card', label: 'Stock Card เคลื่อนไหว', icon: <ScrollText size={15} /> },
          ].map(tab => {
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: isCurrent ? 700 : 500,
                  borderRadius: '8px',
                  border: isCurrent ? '1px solid #0877ee' : '1px solid #dce7f6',
                  background: isCurrent ? '#0877ee' : '#fff',
                  color: isCurrent ? '#fff' : '#31547d',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isCurrent ? '0 2px 6px rgba(8, 119, 238, 0.25)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon} {tab.label}
              </button>
            );
          })}
        </div>

        {/* Action Buttons: Export CSV & Print */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (activeTab === 'sales') exportSalesCsv();
              else if (activeTab === 'products') exportProductsCsv();
              else if (activeTab === 'inventory') exportInventoryCsv();
              else if (activeTab === 'vat') exportVatCsv();
              else if (activeTab === 'stock-card') exportStockCardCsv();
            }}
            style={{ padding: '7px 13px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => window.print()}
            style={{ padding: '7px 13px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} /> พิมพ์รายงาน
          </button>
        </div>
      </div>

      {/* Styled Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#f8fbff',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #dce7f6',
          marginBottom: '18px',
        }}
      >
        {/* Branch Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#163d70', fontWeight: 600 }}>สาขา:</span>
          <div style={{ minWidth: '180px' }}>
            <AppSelect
              icon={<Building2 size={15} />}
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              disabled={profile.role !== 'OWNER'}
            >
              {profile.role === 'OWNER' && <option value="">ทุกสาขาในร้าน</option>}
              {profile.branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </AppSelect>
          </div>
        </div>

        {/* Date Presets (hide for inventory tab) */}
        {activeTab !== 'inventory' && (
          <>
            <div style={{ width: '1px', height: '22px', background: '#dce7f6' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#163d70', fontWeight: 600 }}>ช่วงเวลา:</span>
              <div style={{ minWidth: '150px' }}>
                <AppSelect
                  icon={<Calendar size={15} />}
                  value={datePreset}
                  onChange={e => setDatePreset(e.target.value as DatePreset)}
                >
                  <option value="TODAY">วันนี้</option>
                  <option value="LAST_7_DAYS">7 วันล่าสุด</option>
                  <option value="LAST_30_DAYS">30 วันล่าสุด</option>
                  <option value="THIS_MONTH">เดือนนี้</option>
                  <option value="CUSTOM">กำหนดเอง</option>
                </AppSelect>
              </div>
            </div>

            {datePreset === 'CUSTOM' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #9ec7f4',
                    background: '#fff',
                    color: '#163d70',
                    width: 'auto',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#607a9d' }}>ถึง</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #9ec7f4',
                    background: '#fff',
                    color: '#163d70',
                    width: 'auto',
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Product Filter for Stock Card tab */}
        {activeTab === 'stock-card' && (
          <>
            <div style={{ width: '1px', height: '22px', background: '#dce7f6' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#163d70', fontWeight: 600 }}>สินค้า:</span>
              <div style={{ minWidth: '220px' }}>
                <AppSelect
                  icon={<Package size={15} />}
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                >
                  <option value="">ทุกสินค้าในสาขา</option>
                  {productsListQuery.data?.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </AppSelect>
              </div>
            </div>
          </>
        )}
      </div>

      {/* TAB 1: SALES REPORT */}
      {activeTab === 'sales' && (
        <div>
          {salesReportQuery.isLoading ? (
            <div className="empty-state" role="status">กำลังประมวลผลข้อมูลยอดขาย…</div>
          ) : salesData ? (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>ยอดขายสุทธิ</span>
                    <span style={kpiIconBadgeStyle('#0877ee', '#eaf4ff')}><TrendingUp size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{money.format(salesData.summary.totalSales)}</strong>
                  <span style={kpiSubtextStyle}>จากทั้งหมด {salesData.summary.totalBills} บิล</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>เฉลี่ยต่อบิล (AOV)</span>
                    <span style={kpiIconBadgeStyle('#16825d', '#eaf8ef')}><Receipt size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{money.format(salesData.summary.averageOrderValue)}</strong>
                  <span style={kpiSubtextStyle}>ต่อ 1 รายการขายสำเร็จ</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>ส่วนลดที่มอบให้</span>
                    <span style={kpiIconBadgeStyle('#e67d00', '#fff5df')}><Award size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{money.format(salesData.summary.totalDiscount)}</strong>
                  <span style={kpiSubtextStyle}>โปรโมชัน & ส่วนลดสมาชิก</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>สัดส่วนชำระเงิน</span>
                    <span style={kpiIconBadgeStyle('#7a5af8', '#f4f3ff')}><CreditCard size={16} /></span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                    <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#607a9d' }}>เงินสด:</span>
                      <strong style={{ color: '#163d70' }}>{money.format(salesData.summary.totalCash)}</strong>
                    </div>
                    <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#607a9d' }}>โอนเงิน:</span>
                      <strong style={{ color: '#163d70' }}>{money.format(salesData.summary.totalTransfer)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Rows Table */}
              <div className="table-scroll" style={{ border: '1px solid #d7e5f6', borderRadius: '10px', background: '#fff', maxHeight: '380px' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th>วันที่</th>
                      <th className="numeric">จำนวนบิล</th>
                      <th className="numeric">ยอดก่อนลด</th>
                      <th className="numeric">ส่วนลด</th>
                      <th className="numeric">ยอดขายสุทธิ</th>
                      <th className="numeric">เงินสด</th>
                      <th className="numeric">โอนเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#8297b0' }}>
                          ไม่มีรายการขายในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    ) : (
                      salesData.rows.map(row => (
                        <tr key={row.date}>
                          <td><strong>{row.date}</strong></td>
                          <td className="numeric">{row.bills}</td>
                          <td className="numeric">{money.format(row.subtotal)}</td>
                          <td className="numeric" style={{ color: row.discount > 0 ? '#c23f45' : '#8297b0' }}>
                            {row.discount > 0 ? `-${money.format(row.discount)}` : '0'}
                          </td>
                          <td className="numeric" style={{ fontWeight: 700, color: '#0877ee' }}>
                            {money.format(row.netSales)}
                          </td>
                          <td className="numeric">{money.format(row.cashSales)}</td>
                          <td className="numeric">{money.format(row.transferSales)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {salesData.rows.length > 0 && (
                    <tfoot style={{ background: '#f5f8ff', borderTop: '2px solid #cfe0f5', fontWeight: 700 }}>
                      <tr>
                        <td>รวมทั้งสิ้น</td>
                        <td className="numeric">{salesData.summary.totalBills}</td>
                        <td className="numeric">
                          {money.format(salesData.summary.totalSales + salesData.summary.totalDiscount)}
                        </td>
                        <td className="numeric" style={{ color: '#c23f45' }}>
                          {money.format(salesData.summary.totalDiscount)}
                        </td>
                        <td className="numeric" style={{ color: '#0877ee', fontSize: '14px' }}>
                          {money.format(salesData.summary.totalSales)}
                        </td>
                        <td className="numeric">{money.format(salesData.summary.totalCash)}</td>
                        <td className="numeric">{money.format(salesData.summary.totalTransfer)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">ไม่สามารถโหลดรายงานยอดขายได้</div>
          )}
        </div>
      )}

      {/* TAB 2: TOP PRODUCTS */}
      {activeTab === 'products' && (
        <div>
          {productsReportQuery.isLoading ? (
            <div className="empty-state" role="status">กำลังประมวลผลสินค้าขายดี…</div>
          ) : productsData ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                <span style={{ fontSize: '13px', color: '#163d70' }}>
                  ยอดขายรวมของสินค้าทั้งหมด: <strong>{money.format(productsData.totalRevenue)}</strong>
                </span>
                <span className="pill" style={{ fontSize: '11px' }}>
                  จัดอันดับ {productsData.items.length} สินค้าแรก
                </span>
              </div>

              <div className="table-scroll" style={{ border: '1px solid #d7e5f6', borderRadius: '10px', background: '#fff', maxHeight: '420px' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center' }}>อันดับ</th>
                      <th>สินค้า</th>
                      <th className="numeric" style={{ width: '130px' }}>จำนวนที่ขาย</th>
                      <th className="numeric" style={{ width: '140px' }}>ยอดขาย (บาท)</th>
                      <th style={{ width: '180px' }}>สัดส่วนยอดขาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsData.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#8297b0' }}>
                          ไม่มีรายการสินค้าที่ขายได้ในช่วงเวลานี้
                        </td>
                      </tr>
                    ) : (
                      productsData.items.map((item, idx) => (
                        <tr key={item.productId}>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f1f5f9' : idx === 2 ? '#ffedd5' : '#eaf4ff',
                                color: idx === 0 ? '#b45309' : idx === 1 ? '#475569' : idx === 2 ? '#9a3412' : '#0877ee',
                              }}
                            >
                              {idx + 1}
                            </span>
                          </td>
                          <td>
                            <div className="product-name">
                              <span className="product-icon"><Package size={18} /></span>
                              <div>
                                <strong>{item.name}</strong>
                                <small style={{ display: 'block', color: '#607a9d' }}>SKU: {item.sku}</small>
                              </div>
                            </div>
                          </td>
                          <td className="numeric" style={{ fontWeight: 600 }}>
                            {item.quantitySold.toLocaleString()} ชิ้น
                          </td>
                          <td className="numeric" style={{ fontWeight: 700, color: '#0877ee' }}>
                            {money.format(item.revenue)}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, height: '7px', background: '#eaf1fa', borderRadius: '4px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, item.sharePercent)}%`,
                                    background: idx === 0 ? '#16825d' : '#0877ee',
                                    borderRadius: '4px',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: '11px', color: '#607a9d', minWidth: '38px', textAlign: 'right' }}>
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
            <div className="empty-state">ไม่สามารถโหลดรายงานสินค้าได้</div>
          )}
        </div>
      )}

      {/* TAB 3: INVENTORY VALUATION */}
      {activeTab === 'inventory' && (
        <div>
          {inventoryValuationQuery.isLoading ? (
            <div className="empty-state" role="status">กำลังคำนวณมูลค่าสต็อกสินค้า…</div>
          ) : invData ? (
            <div>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>รายการสินค้า (SKUs)</span>
                    <span style={kpiIconBadgeStyle('#0877ee', '#eaf4ff')}><Package size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{invData.summary.totalSKUs} รายการ</strong>
                  <span style={kpiSubtextStyle}>ทั้งหมดในสาขาที่เลือก</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>จำนวนชิ้นคงคลังรวม</span>
                    <span style={kpiIconBadgeStyle('#16825d', '#eaf8ef')}><Boxes size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{invData.summary.totalUnits.toLocaleString()} ชิ้น</strong>
                  <span style={kpiSubtextStyle}>ยอดคงคลังพร้อมขาย</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>มูลค่าประเมินสต็อก</span>
                    <span style={kpiIconBadgeStyle('#7a5af8', '#f4f3ff')}><Landmark size={16} /></span>
                  </div>
                  <strong style={{ ...kpiValueStyle, color: '#0877ee' }}>{money.format(invData.summary.totalValuation)}</strong>
                  <span style={kpiSubtextStyle}>คำนวณจากราคาขายปัจจุบัน</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>สินค้าใกล้หมด / หมด</span>
                    <span style={kpiIconBadgeStyle('#e67d00', '#fff5df')}><AlertTriangle size={16} /></span>
                  </div>
                  <strong style={{ ...kpiValueStyle, color: invData.summary.lowStockCount > 0 ? '#e67d00' : '#16825d' }}>
                    {invData.summary.lowStockCount} / {invData.summary.outOfStockCount}
                  </strong>
                  <span style={kpiSubtextStyle}>
                    {invData.summary.lowStockCount > 0 ? 'ควรพิจารณาเติมสต็อก' : 'สต็อกอยู่ในเกณฑ์ปกติ'}
                  </span>
                </div>
              </div>

              {/* Inventory Table */}
              <div className="table-scroll" style={{ border: '1px solid #d7e5f6', borderRadius: '10px', background: '#fff', maxHeight: '380px' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th>สินค้า</th>
                      <th>สาขา</th>
                      <th className="numeric">คงเหลือในคลัง</th>
                      <th className="numeric">ราคาขาย</th>
                      <th className="numeric">มูลค่ารวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invData.items.map(item => (
                      <tr key={`${item.branchId}-${item.productId}`}>
                        <td>
                          <div className="product-name">
                            <span className="product-icon"><Package size={18} /></span>
                            <div>
                              <strong>{item.productName}</strong>
                              <small style={{ display: 'block', color: '#607a9d' }}>SKU: {item.sku}</small>
                            </div>
                          </div>
                        </td>
                        <td>{item.branchName}</td>
                        <td className="numeric">
                          <span
                            className={`pill ${
                              item.quantity <= 0 ? 'inactive' : item.quantity <= 5 ? 'unbalanced' : 'green'
                            }`}
                            style={{
                              fontWeight: 600,
                              background: item.quantity <= 0 ? '#fff1f2' : item.quantity <= 5 ? '#fff5df' : '#eaf8ef',
                              color: item.quantity <= 0 ? '#c23f45' : item.quantity <= 5 ? '#e67d00' : '#16825d',
                            }}
                          >
                            {item.quantity.toLocaleString()} ชิ้น
                          </span>
                        </td>
                        <td className="numeric">{money.format(item.unitPrice)}</td>
                        <td className="numeric" style={{ fontWeight: 700, color: '#0877ee' }}>
                          {money.format(item.valuation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="empty-state">ไม่สามารถโหลดรายงานสต็อกได้</div>
          )}
        </div>
      )}

      {/* TAB 4: VAT SALES REPORT (ภ.พ.30) */}
      {activeTab === 'vat' && (
        <div>
          {vatReportQuery.isPending ? (
            <div className="empty-state" role="status">กำลังประมวลผลข้อมูลภาษีขาย…</div>
          ) : vatReportQuery.isError ? (
            <div className="empty-state">
              <p className="error">เกิดข้อผิดพลาดในการโหลดรายงานภาษีขาย</p>
              <button className="secondary" onClick={() => vatReportQuery.refetch()}>ลองอีกครั้ง</button>
            </div>
          ) : vatReportQuery.data ? (
            <div>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>ยอดขายรวมทั้งสิ้น (Gross)</span>
                    <span style={kpiIconBadgeStyle('#0877ee', '#eaf4ff')}><Receipt size={16} /></span>
                  </div>
                  <strong style={kpiValueStyle}>{money.format(vatReportQuery.data.summary.totalGrossSales)}</strong>
                  <span style={kpiSubtextStyle}>รวม {vatReportQuery.data.summary.totalSalesCount} บิล</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>มูลค่าสินค้าฐานภาษี (Base)</span>
                    <span style={kpiIconBadgeStyle('#16825d', '#eaf8ef')}><Landmark size={16} /></span>
                  </div>
                  <strong style={{ ...kpiValueStyle, color: '#0877ee' }}>{money.format(vatReportQuery.data.summary.totalTaxableBase)}</strong>
                  <span style={kpiSubtextStyle}>ก่อนคิด VAT 7%</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>ภาษีขายที่ต้องนำส่ง (7%)</span>
                    <span style={kpiIconBadgeStyle('#16825d', '#eaf8ef')}><Receipt size={16} /></span>
                  </div>
                  <strong style={{ ...kpiValueStyle, color: '#16825d' }}>{money.format(vatReportQuery.data.summary.totalOutputVat)}</strong>
                  <span style={kpiSubtextStyle}>สำหรับยื่นแบบ ภ.พ.30</span>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiHeaderStyle}>
                    <span style={kpiLabelStyle}>สัดส่วนเอกสาร</span>
                    <span style={kpiIconBadgeStyle('#7a5af8', '#f4f3ff')}><FileSpreadsheet size={16} /></span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                    <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#607a9d' }}>เต็มรูป:</span>
                      <strong style={{ color: '#163d70' }}>{vatReportQuery.data.summary.fullInvoiceCount} ใบ</strong>
                    </div>
                    <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#607a9d' }}>อย่างย่อ:</span>
                      <strong style={{ color: '#163d70' }}>{vatReportQuery.data.summary.abbCount} ใบ</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="table-scroll" style={{ border: '1px solid #d7e5f6', borderRadius: '10px', background: '#fff', maxHeight: '380px' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: '50px', textAlign: 'center' }}>ลำดับ</th>
                      <th>วันที่-เวลา</th>
                      <th>เลขที่ใบกำกับ/ใบเสร็จ</th>
                      <th style={{ textAlign: 'center' }}>ประเภท</th>
                      <th>ชื่อผู้ซื้อ</th>
                      <th>เลขผู้เสียภาษี</th>
                      <th className="numeric">มูลค่าสินค้า</th>
                      <th className="numeric">ภาษี 7%</th>
                      <th className="numeric">รวมทั้งสิ้น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatReportQuery.data.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#8297b0' }}>
                          ไม่มีข้อมูลการขายในรอบเวลาที่เลือก
                        </td>
                      </tr>
                    ) : (
                      vatReportQuery.data.items.map((row, idx) => (
                        <tr key={row.saleId}>
                          <td style={{ textAlign: 'center', color: '#607a9d' }}>{idx + 1}</td>
                          <td>
                            <div>{new Date(row.createdAt).toLocaleDateString('th-TH')}</div>
                            <small style={{ color: '#8297b0' }}>
                              {new Date(row.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </small>
                          </td>
                          <td><strong>{row.documentNumber}</strong></td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className="pill"
                              style={{
                                fontSize: '10px',
                                background: row.invoiceType === 'FULL' ? '#eaf4ff' : '#f0f4fa',
                                color: row.invoiceType === 'FULL' ? '#0877ee' : '#607a9d',
                                fontWeight: 600,
                              }}
                            >
                              {row.invoiceType === 'FULL' ? 'เต็มรูป' : 'อย่างย่อ'}
                            </span>
                          </td>
                          <td>{row.customerName}</td>
                          <td style={{ fontFamily: 'monospace', color: '#607a9d', fontSize: '12px' }}>{row.customerTaxId || '-'}</td>
                          <td className="numeric">{money.format(row.taxableAmount)}</td>
                          <td className="numeric" style={{ color: '#16825d', fontWeight: 600 }}>{money.format(row.vatAmount)}</td>
                          <td className="numeric" style={{ fontWeight: 700, color: '#163d70' }}>{money.format(row.totalAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 5: STOCK CARD (ความเคลื่อนไหวสต็อก) */}
      {activeTab === 'stock-card' && (
        <div>
          {stockCardReportQuery.isPending ? (
            <div className="empty-state" role="status">กำลังประมวลผลประวัติการเคลื่อนไหวสต็อก…</div>
          ) : stockCardReportQuery.isError ? (
            <div className="empty-state">
              <p className="error">เกิดข้อผิดพลาดในการโหลดรายงานสต็อกการ์ด</p>
              <button className="secondary" onClick={() => stockCardReportQuery.refetch()}>ลองอีกครั้ง</button>
            </div>
          ) : stockCardReportQuery.data ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                <span style={{ fontSize: '13px', color: '#163d70' }}>
                  ประวัติการเปลี่ยนแปลงสต็อกล่าสุด: <strong>{stockCardReportQuery.data.summary.totalRecords}</strong> รายการ
                </span>
                <span className="pill green" style={{ fontSize: '11px' }}>
                  คำนวณ Running Balance แบบเรียลไทม์
                </span>
              </div>

              <div className="table-scroll" style={{ border: '1px solid #d7e5f6', borderRadius: '10px', background: '#fff', maxHeight: '400px' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th>วันที่-เวลา</th>
                      <th>สาขา</th>
                      <th>สินค้า</th>
                      <th style={{ textAlign: 'center' }}>ประเภทรายการ</th>
                      <th className="numeric">ก่อนทำ</th>
                      <th className="numeric">จำนวน</th>
                      <th className="numeric">คงเหลือหลังทำ</th>
                      <th>ผู้บันทึก</th>
                      <th>หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCardReportQuery.data.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#8297b0' }}>
                          ไม่มีรายการเคลื่อนไหวสต็อกในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    ) : (
                      stockCardReportQuery.data.items.map(row => {
                        const isPositive = row.quantity > 0;
                        const isNegative = row.quantity < 0;
                        return (
                          <tr key={row.id}>
                            <td>
                              <div>{new Date(row.createdAt).toLocaleDateString('th-TH')}</div>
                              <small style={{ color: '#8297b0' }}>
                                {new Date(row.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                              </small>
                            </td>
                            <td>{row.branchName}</td>
                            <td>
                              <div className="product-name">
                                <span className="product-icon"><Package size={16} /></span>
                                <div>
                                  <strong>{row.productName}</strong>
                                  <small style={{ display: 'block', color: '#607a9d' }}>SKU: {row.sku}</small>
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="pill"
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: row.type === 'RECEIVE' ? '#eaf8ef' : row.type === 'SALE' ? '#eaf4ff' : row.type === 'ADJUST' ? '#fff5df' : '#f0f4fa',
                                  color: row.type === 'RECEIVE' ? '#16825d' : row.type === 'SALE' ? '#0877ee' : row.type === 'ADJUST' ? '#e67d00' : '#607a9d',
                                }}
                              >
                                {row.type}
                              </span>
                            </td>
                            <td className="numeric">{row.balanceBefore.toLocaleString()}</td>
                            <td
                              className="numeric"
                              style={{
                                fontWeight: 700,
                                color: isPositive ? '#16825d' : isNegative ? '#c23f45' : '#607a9d',
                              }}
                            >
                              {isPositive ? `+${row.quantity.toLocaleString()}` : row.quantity.toLocaleString()}
                            </td>
                            <td className="numeric" style={{ fontWeight: 700, color: '#0877ee' }}>
                              {row.balanceAfter.toLocaleString()}
                            </td>
                            <td>{row.actorName}</td>
                            <td style={{ color: '#607a9d', fontSize: '12px' }}>{row.note || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </dialog>
  );
}

// Inline Style Constants for KPI Cards
const kpiCardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d7e5f6',
  borderRadius: '10px',
  padding: '14px 16px',
  boxShadow: '0 2px 4px rgba(8, 119, 238, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const kpiHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '2px',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#607a9d',
  fontWeight: 600,
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '20px',
  color: '#102f5d',
  letterSpacing: '-0.3px',
};

const kpiSubtextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#607a9d',
};

const kpiIconBadgeStyle = (color: string, bg: string): React.CSSProperties => ({
  background: bg,
  color: color,
  padding: '5px',
  borderRadius: '7px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
