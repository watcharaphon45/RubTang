import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Printer,
  Receipt,
  RotateCcw,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  Branch,
  createTaxInvoice,
  getBranchTaxSettings,
  getTaxInvoiceBySaleId,
  SaleHistoryItem,
  TaxInvoice,
  TaxInvoiceRequest,
} from './api';
import { bahtText, calculateVat } from './baht-text';

export function TaxInvoiceDialog({
  sale,
  branch,
  close,
}: {
  sale: SaleHistoryItem;
  branch: Branch;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'slip' | 'a4'>('slip');
  const [docCopyType, setDocCopyType] = useState<'ORIGINAL' | 'COPY'>('ORIGINAL');
  const [isCopied, setIsCopied] = useState(false);

  // Form state for creating full tax invoice
  const [customerName, setCustomerName] = useState(sale.customer?.name || '');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerBranchNumber, setCustomerBranchNumber] = useState('00000');
  const [customerIsHeadOffice, setCustomerIsHeadOffice] = useState(true);
  const [customerPhone, setCustomerPhone] = useState(sale.customer?.phone || '');
  const [saveCustomerTaxInfo, setSaveCustomerTaxInfo] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch branch tax settings
  const branchTaxQuery = useQuery({
    queryKey: ['branch-tax-settings', branch.id],
    queryFn: () => getBranchTaxSettings(branch.id),
  });

  // Fetch existing tax invoice for this sale
  const taxInvoiceQuery = useQuery({
    queryKey: ['sale-tax-invoice', sale.id],
    queryFn: () => getTaxInvoiceBySaleId(sale.id),
  });

  const taxInvoice = taxInvoiceQuery.data;

  // Create Tax Invoice Mutation
  const createMutation = useMutation({
    mutationFn: (payload: TaxInvoiceRequest) => createTaxInvoice(sale.id, payload),
    onSuccess: (data) => {
      setFormError(null);
      queryClient.setQueryData(['sale-tax-invoice', sale.id], data);
      setActiveTab('a4');
    },
    onError: (err: any) => {
      setFormError(err.message || 'เกิดข้อผิดพลาดในการออกใบกำกับภาษีเต็มรูป');
    },
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setFormError('กรุณาระบุชื่อผู้ซื้อหรือชื่อบริษัท');
      return;
    }
    if (customerTaxId.trim() && !/^\d{13}$/.test(customerTaxId.trim())) {
      setFormError('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก');
      return;
    }

    createMutation.mutate({
      customerName: customerName.trim(),
      customerTaxId: customerTaxId.trim() || undefined,
      customerAddress: customerAddress.trim() || undefined,
      customerBranchNumber: customerIsHeadOffice ? '00000' : (customerBranchNumber.trim() || '00000'),
      customerIsHeadOffice,
      customerPhone: customerPhone.trim() || undefined,
      saveCustomerTaxInfo,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyInvoiceNumber = () => {
    if (taxInvoice) {
      navigator.clipboard.writeText(taxInvoice.invoiceNumber);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const branchSettings = branchTaxQuery.data;
  const storeName = branchSettings?.companyName || branchSettings?.name || branch.name;
  const storeTaxId = branchSettings?.taxId || '0105559012345';
  const storeAddress = branchSettings?.taxAddress || 'กรุงเทพมหานคร';
  const storeBranchNo = branchSettings?.branchNumber || '00000';
  const storeIsHeadOffice = branchSettings?.isHeadOffice ?? true;
  const storePhone = branchSettings?.phone || '02-123-4567';

  const totalNum = Number(sale.total);
  const vatCalculated = calculateVat(totalNum, 7);

  return (
    <dialog
      ref={dialog}
      className="m-auto w-[95vw] max-w-4xl rounded-3xl bg-slate-900 border border-slate-700/60 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/75 backdrop:backdrop-blur-md overflow-hidden flex flex-col max-h-[94vh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 shadow-inner">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">ใบเสร็จรับเงิน & ใบกำกับภาษี</h2>
              <span className="font-mono text-xs rounded-full bg-slate-800 px-2.5 py-0.5 font-semibold text-blue-400 border border-slate-700">
                {sale.receiptNumber}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              พิมพ์ใบเสร็จอย่างย่อ (สลิป 80mm) หรือ ออกใบกำกับภาษีเต็มรูปตามแบบ ภ.พ.20
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Format Switcher */}
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60">
            <button
              type="button"
              onClick={() => setActiveTab('slip')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'slip'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              สลิปอย่างย่อ (80mm)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('a4')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'a4'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              ใบกำกับภาษีเต็มรูป (A4)
            </button>
          </div>

          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'slip' ? (
          /* =========================================================================
             SLIP PREVIEW (THERMAL POS 80MM)
             ========================================================================= */
          <div className="flex flex-col items-center">
            {/* Action Bar */}
            <div className="w-full max-w-sm flex items-center justify-between mb-4">
              <span className="text-xs text-slate-400">ตัวอย่างสลิปความร้อน (80mm)</span>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-md transition"
              >
                <Printer className="h-4 w-4" />
                สั่งพิมพ์สลิป (Print Slip)
              </button>
            </div>

            {/* Printable Slip Container */}
            <div className="printable-area bg-white text-slate-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-slate-300 font-mono text-xs select-text printable-slip">
              {/* Slip Header */}
              <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                <div className="font-bold text-base tracking-tight">{storeName}</div>
                <div className="text-[11px] font-semibold text-slate-700">
                  ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ
                </div>
                <div className="text-[10px] text-slate-500 tracking-wider">TAX INVOICE (ABB)</div>
                <div className="text-[10px] text-slate-600 mt-1">
                  เลขประจำตัวผู้เสียภาษี: <span className="font-bold">{storeTaxId}</span>
                </div>
                <div className="text-[10px] text-slate-600">
                  {storeIsHeadOffice ? 'สำนักงานใหญ่' : `สาขาที่ ${storeBranchNo}`} ({branch.name})
                </div>
                <div className="text-[10px] text-slate-500 leading-tight">{storeAddress}</div>
                {storePhone && <div className="text-[10px] text-slate-500">โทร: {storePhone}</div>}
              </div>

              {/* Meta details */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">เลขที่บิล:</span>
                  <span className="font-bold">{sale.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">วันที่:</span>
                  <span>{new Date(sale.createdAt).toLocaleString('th-TH')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">พนักงาน:</span>
                  <span>{sale.cashierName}</span>
                </div>
                {sale.customer && (
                  <div className="flex justify-between pt-1 border-t border-dotted border-slate-200">
                    <span className="text-slate-600">ลูกค้าสมาชิก:</span>
                    <span className="font-semibold">{sale.customer.name}</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="py-3 border-b border-dashed border-slate-300 space-y-2">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="flex justify-between text-slate-600 text-[11px]">
                      <span>{item.quantity} x {Number(item.price).toFixed(2)}</span>
                      <span className="font-bold text-slate-900">{Number(item.subtotal).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>รวมเป็นเงิน:</span>
                  <span>{Number(sale.subtotal).toFixed(2)}</span>
                </div>
                {Number(sale.discount) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>ส่วนลด:</span>
                    <span>-{Number(sale.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                  <span>ยอดสุทธิ (Total):</span>
                  <span>฿{Number(sale.total).toFixed(2)}</span>
                </div>

                {/* VAT Breakdown */}
                <div className="pt-2 text-[10px] text-slate-500 space-y-0.5">
                  <div className="italic text-center text-slate-600 font-semibold mb-1">
                    (ราคานี้รวมภาษีมูลค่าเพิ่ม 7% แล้ว)
                  </div>
                  <div className="flex justify-between">
                    <span>มูลค่าก่อนภาษี:</span>
                    <span>฿{vatCalculated.taxableAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                    <span>฿{vatCalculated.vatAmount}</span>
                  </div>
                </div>

                {/* Payment method */}
                <div className="flex justify-between pt-1 text-[11px] text-slate-700">
                  <span>ชำระโดย:</span>
                  <span className="font-semibold">
                    {sale.paymentMethod === 'CASH' ? 'เงินสด (Cash)' : 'โอนเงิน / PromptPay'}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-3 space-y-1 text-[10px] text-slate-500">
                <div className="font-semibold text-slate-700">
                  {branchSettings?.receiptHeader || 'ขอบคุณที่ใช้บริการร้านรับตังค์'}
                </div>
                <div>{branchSettings?.receiptFooter || 'สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน'}</div>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             A4 FULL TAX INVOICE PREVIEW OR ISSUING FORM
             ========================================================================= */
          <div className="space-y-6">
            {!taxInvoice ? (
              /* Issuing Form */
              <div className="max-w-xl mx-auto rounded-2xl border border-slate-800 bg-slate-800/40 p-6 space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-700/60 pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">ออกใบกำกับภาษีเต็มรูป</h3>
                    <p className="text-xs text-slate-400">กรอกข้อมูลผู้ซื้อหรือนิติบุคคลเพื่อออกเอกสารแบบ ภ.พ.20</p>
                  </div>
                </div>

                {formError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      ชื่อผู้ซื้อ / ชื่อบริษัท / นิติบุคคล <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น บริษัท สยามเทคโนโลยี จำกัด หรือ คุณสมชาย ใจดี"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        เลขประจำตัวผู้เสียภาษี (13 หลัก)
                      </label>
                      <input
                        type="text"
                        maxLength={13}
                        placeholder="เลข 13 หลัก (เลขนิติบุคคลหรือบัตร ปชช.)"
                        value={customerTaxId}
                        onChange={(e) => setCustomerTaxId(e.target.value.replace(/\D/g, ''))}
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        เบอร์โทรศัพท์
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น 0812345678"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Head office or Branch */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={customerIsHeadOffice}
                        onChange={(e) => setCustomerIsHeadOffice(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>สำนักงานใหญ่ (Head Office)</span>
                    </label>

                    {!customerIsHeadOffice && (
                      <div className="pl-6">
                        <label className="block text-xs text-slate-400 mb-1">เลขที่สาขา</label>
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="เช่น 00001"
                          value={customerBranchNumber}
                          onChange={(e) => setCustomerBranchNumber(e.target.value)}
                          className="w-32 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      ที่อยู่จดทะเบียนสำหรับออกใบกำกับภาษี
                    </label>
                    <textarea
                      rows={2}
                      placeholder="เช่น 123 อาคารพาณิชย์ ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={saveCustomerTaxInfo}
                        onChange={(e) => setSaveCustomerTaxInfo(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>บันทึกข้อมูลภาษีนี้ไว้กับประวัติลูกค้า</span>
                    </label>

                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 shadow-md transition"
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          กำลังออกเอกสาร...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          ออกใบกำกับภาษีเต็มรูปทันที
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* A4 Full Tax Invoice Preview */
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white tracking-wide">
                      {taxInvoice.invoiceNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyInvoiceNumber}
                      title="คัดลอกเลขที่ใบกำกับภาษี"
                      className="flex items-center gap-1 rounded-lg bg-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-white transition"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{isCopied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                    </button>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                      ออกเอกสารสำเร็จ
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Original / Copy Toggle */}
                    <div className="flex rounded-xl bg-slate-900 p-0.5 border border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => setDocCopyType('ORIGINAL')}
                        className={`rounded-lg px-3 py-1 font-semibold transition ${
                          docCopyType === 'ORIGINAL'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ต้นฉบับ (Original)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocCopyType('COPY')}
                        className={`rounded-lg px-3 py-1 font-semibold transition ${
                          docCopyType === 'COPY'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        สำเนา (Copy)
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handlePrint}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-md transition"
                    >
                      <Printer className="h-4 w-4" />
                      พิมพ์ A4 (Print A4)
                    </button>
                  </div>
                </div>

                {/* Printable A4 Container */}
                <div className="printable-area bg-white text-slate-900 rounded-2xl p-8 md:p-12 shadow-2xl border border-slate-300 max-w-4xl mx-auto printable-a4 space-y-6 text-xs">
                  {/* Top Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
                    <div className="space-y-1 max-w-md">
                      <h1 className="text-xl font-bold tracking-tight text-slate-900 m-0">
                        {taxInvoice.issuer.name}
                      </h1>
                      <div className="text-slate-700 text-[11px] leading-relaxed">
                        {taxInvoice.issuer.address}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-800 pt-1">
                        <div>เลขประจำตัวผู้เสียภาษี: <span className="font-bold">{taxInvoice.issuer.taxId}</span></div>
                        <div>
                          {taxInvoice.issuer.isHeadOffice ? 'สำนักงานใหญ่' : `สาขาที่ ${taxInvoice.issuer.branchNumber}`}
                        </div>
                      </div>
                      {taxInvoice.issuer.phone && (
                        <div className="text-[11px] text-slate-600">โทรศัพท์: {taxInvoice.issuer.phone}</div>
                      )}
                    </div>

                    <div className="text-right space-y-1.5">
                      <div className="inline-block border-2 border-slate-900 px-3 py-1 font-bold text-sm uppercase tracking-wide bg-slate-50">
                        {docCopyType === 'ORIGINAL' ? 'ต้นฉบับ / ORIGINAL' : 'สำเนา / COPY'}
                      </div>
                      <div className="text-base font-bold text-slate-900">
                        ใบเสร็จรับเงิน / ใบกำกับภาษี
                      </div>
                      <div className="text-[10px] text-slate-500 tracking-wider">
                        RECEIPT / TAX INVOICE (ภ.พ.20)
                      </div>
                      <div className="text-[11px] font-mono pt-1 text-slate-800">
                        เลขที่: <span className="font-bold text-slate-900">{taxInvoice.invoiceNumber}</span>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        วันที่: {new Date(taxInvoice.issuedAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        อ้างอิงบิล: {taxInvoice.receiptNumber}
                      </div>
                    </div>
                  </div>

                  {/* Customer Information Box */}
                  <div className="rounded-xl border border-slate-300 p-4 bg-slate-50/50 space-y-1.5">
                    <div className="font-bold text-slate-900 text-xs">ข้อมูลผู้ซื้อ / CUSTOMER:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-800">
                      <div>
                        <span className="text-slate-500">ชื่อ:</span>{' '}
                        <span className="font-semibold text-slate-900">{taxInvoice.customer.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">เลขประจำตัวผู้เสียภาษี:</span>{' '}
                        <span className="font-mono font-bold">{taxInvoice.customer.taxId || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">สาขา:</span>{' '}
                        <span>
                          {taxInvoice.customer.isHeadOffice ? 'สำนักงานใหญ่' : `สาขาที่ ${taxInvoice.customer.branchNumber}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">โทรศัพท์:</span>{' '}
                        <span>{taxInvoice.customer.phone || '-'}</span>
                      </div>
                      <div className="md:col-span-2 pt-0.5">
                        <span className="text-slate-500">ที่อยู่:</span>{' '}
                        <span>{taxInvoice.customer.address || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border border-slate-300 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[10px] font-bold border-b border-slate-300">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">ลำดับ</th>
                          <th className="py-2.5 px-4">รายการสินค้า / DESCRIPTION</th>
                          <th className="py-2.5 px-3 text-center w-20">จำนวน</th>
                          <th className="py-2.5 px-3 text-right w-28">ราคา/หน่วย</th>
                          <th className="py-2.5 px-4 text-right w-28">จำนวนเงิน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {taxInvoice.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">{it.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">SKU: {it.sku}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">{Number(it.quantity).toFixed(0)}</td>
                            <td className="py-2.5 px-3 text-right font-mono">{Number(it.price).toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold">{Number(it.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Baht Text Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Baht Text Box */}
                    <div className="rounded-xl border border-slate-300 p-4 bg-slate-50/60 flex flex-col justify-between h-full min-h-[100px]">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          จำนวนเงินตัวอักษร / BAHT TEXT:
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-1.5 leading-relaxed">
                          ({taxInvoice.bahtText})
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 italic mt-2">
                        ชำระโดย: {taxInvoice.paymentMethod === 'CASH' ? 'เงินสด (Cash)' : 'โอนเงิน / PromptPay'}
                      </div>
                    </div>

                    {/* Numeric Summary Table */}
                    <div className="rounded-xl border border-slate-300 overflow-hidden divide-y divide-slate-200 text-xs">
                      <div className="flex justify-between py-2 px-3.5 bg-slate-50/50">
                        <span className="text-slate-600">รวมมูลค่าสินค้า (Subtotal):</span>
                        <span className="font-mono font-semibold">{Number(taxInvoice.subtotal).toFixed(2)}</span>
                      </div>
                      {Number(taxInvoice.discount) > 0 && (
                        <div className="flex justify-between py-2 px-3.5 text-rose-600">
                          <span>ส่วนลด (Discount):</span>
                          <span className="font-mono font-semibold">-{Number(taxInvoice.discount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 px-3.5">
                        <span className="text-slate-600">มูลค่าฐานภาษี (Taxable Base):</span>
                        <span className="font-mono font-semibold">{Number(taxInvoice.taxableAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 px-3.5">
                        <span className="text-slate-600">ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                        <span className="font-mono font-semibold">{Number(taxInvoice.vatAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 px-3.5 bg-blue-50/60 text-slate-900 font-bold border-t-2 border-slate-900">
                        <span className="text-sm">ยอดเงินรวมทั้งสิ้น (Grand Total):</span>
                        <span className="font-mono text-base text-blue-900">฿{Number(taxInvoice.total).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
                    <div className="space-y-6">
                      <div className="h-10 border-b border-dashed border-slate-400 w-44 mx-auto"></div>
                      <div>
                        <div className="font-bold text-slate-800">ผู้รับเอกสาร / RECEIVED BY</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">วันที่: ..... / ..... / ..........</div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="h-10 border-b border-dashed border-slate-400 w-44 mx-auto"></div>
                      <div>
                        <div className="font-bold text-slate-800">ผู้มีอำนาจลงนาม / AUTHORIZED SIGNATURE</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">({taxInvoice.issuedByName})</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
