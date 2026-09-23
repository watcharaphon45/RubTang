import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Search, X } from 'lucide-react';
import { Product } from './api';
import { AppSelect } from './components/app-select';
import {
  generateBarcodeSvg,
  generateInternalBarcode,
  validateEan13,
} from './barcode-engine';

export type LabelTemplateId =
  | 'thermal-30x20'
  | 'thermal-40x30'
  | 'thermal-50x30'
  | 'shelf-70x40'
  | 'a4-24'
  | 'a4-40';

export interface LabelTemplate {
  id: LabelTemplateId;
  name: string;
  category: 'thermal' | 'shelf' | 'a4';
  widthMm: number;
  heightMm: number;
  description: string;
  badge: string;
  a4Cols?: number;
  a4Rows?: number;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: 'thermal-30x20',
    name: 'ม้วนความร้อน 30 × 20 มม.',
    category: 'thermal',
    widthMm: 30,
    heightMm: 20,
    description: 'ขนาดเล็กกระทัดรัด เหมาะสำหรับเครื่องประดับ เครื่องเขียน หรือสินค้าชิ้นเล็ก',
    badge: 'ขนาดเล็ก (Small)',
  },
  {
    id: 'thermal-40x30',
    name: 'ม้วนความร้อน 40 × 30 มม.',
    category: 'thermal',
    widthMm: 40,
    heightMm: 30,
    description: 'ขนาดยอดนิยมมาตรฐานร้านค้าปลีก ชื่อสินค้า บาร์โค้ด และราคาชัดเจน',
    badge: 'ยอดนิยม (Popular)',
  },
  {
    id: 'thermal-50x30',
    name: 'ม้วนความร้อน 50 × 30 มม.',
    category: 'thermal',
    widthMm: 50,
    heightMm: 30,
    description: 'ขนาดมาตรฐาน พร้อมชื่อร้านค้า ตัวเลขราคาขนาดใหญ่พิเศษ และหน่วยนับ',
    badge: 'มาตรฐาน (Standard)',
  },
  {
    id: 'shelf-70x40',
    name: 'ป้ายชั้นวาง (Shelf Talker) 70 × 40 มม.',
    category: 'shelf',
    widthMm: 70,
    heightMm: 40,
    description: 'ป้ายราคาเสียบรางหน้าเชลฟ์ ดีไซน์พรีเมียม ตัวเลขราคาใหญ่สะดุดตา',
    badge: 'ป้ายติดเชลฟ์ (Shelf Tag)',
  },
  {
    id: 'a4-24',
    name: 'สติกเกอร์ A4 - 24 ดวง (3 × 8)',
    category: 'a4',
    widthMm: 70,
    heightMm: 37,
    a4Cols: 3,
    a4Rows: 8,
    description: 'กระดาษสติกเกอร์สำเร็จรูปแผ่น A4 24 ป้าย สำหรับเครื่องพิมพ์ Laser / Inkjet',
    badge: 'A4 Sheet (24)',
  },
  {
    id: 'a4-40',
    name: 'สติกเกอร์ A4 - 40 ดวง (4 × 10)',
    category: 'a4',
    widthMm: 52.5,
    heightMm: 29.7,
    a4Cols: 4,
    a4Rows: 10,
    description: 'กระดาษสติกเกอร์สำเร็จรูปแผ่น A4 40 ป้าย ประหยัดพื้นที่ ปริมาณต่อแผ่นสูง',
    badge: 'A4 Sheet (40)',
  },
];

export interface BarcodePrintItem {
  product: Product;
  quantity: number;
  barcodeOverride?: string;
}

interface BarcodeDialogProps {
  products: Product[];
  storeName?: string;
  initialSelectedProduct?: Product | null;
  onClose: () => void;
}

export function BarcodeDialog({
  products,
  storeName = 'RubTang POS',
  initialSelectedProduct,
  onClose,
}: BarcodeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);

  // Selected Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<LabelTemplateId>('thermal-40x30');

  // Customization Options
  const [customStoreName, setCustomStoreName] = useState(storeName);
  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [unitText, setUnitText] = useState('ชิ้น');
  const [barcodeFormat, setBarcodeFormat] = useState<'auto' | 'code128' | 'ean13'>('auto');

  // Print Queue
  const [queue, setQueue] = useState<BarcodePrintItem[]>(() => {
    if (initialSelectedProduct) {
      return [{ product: initialSelectedProduct, quantity: 1 }];
    }
    // Default: Pick first 3 active products
    return products.slice(0, 3).map((p) => ({
      product: p,
      quantity: 1,
    }));
  });

  // Filter/Search for adding products
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const activeTemplate = useMemo(
    () => LABEL_TEMPLATES.find((t) => t.id === selectedTemplateId) || LABEL_TEMPLATES[1],
    [selectedTemplateId]
  );

  // Total labels to be printed
  const totalLabelCount = useMemo(
    () => queue.reduce((sum, item) => sum + item.quantity, 0),
    [queue]
  );

  // Flattened labels list for rendering (each duplicate represents 1 physical sticker)
  const flattenedLabels = useMemo(() => {
    const list: { product: Product; barcode: string }[] = [];
    queue.forEach((item) => {
      const barcodeValue =
        item.barcodeOverride ||
        item.product.barcode ||
        generateInternalBarcode(item.product.sku);
      for (let i = 0; i < item.quantity; i++) {
        list.push({ product: item.product, barcode: barcodeValue });
      }
    });
    return list;
  }, [queue]);

  const filteredCatalog = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term))
    );
  }, [products, searchTerm]);

  // Queue actions
  const handleUpdateQuantity = (productId: string, delta: number) => {
    setQueue((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = Math.max(1, item.quantity + delta);
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleSetQuantity = (productId: string, qty: number) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: Math.max(1, qty) } : item
      )
    );
  };

  const handleRemoveItem = (productId: string) => {
    setQueue((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleAddProductToQueue = (product: Product) => {
    setQueue((prev) => {
      const exists = prev.find((item) => item.product.id === product.id);
      if (exists) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearchTerm('');
  };

  const handleAddAllProducts = () => {
    setQueue(
      products.map((p) => ({
        product: p,
        quantity: 1,
      }))
    );
  };

  const handleFillStockQuantity = () => {
    setQueue((prev) =>
      prev.map((item) => {
        const stockQty = Math.max(1, parseInt(item.product.quantity, 10) || 1);
        return { ...item, quantity: stockQty };
      })
    );
  };

  const handleGenerateBarcodeForProduct = (productId: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const newBarcode = generateInternalBarcode(item.product.sku);
          return { ...item, barcodeOverride: newBarcode };
        }
        return item;
      })
    );
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper to render individual label HTML/SVG based on active template
  const renderSingleLabel = (
    product: Product,
    barcode: string,
    keyIndex: number
  ) => {
    const isEan = validateEan13(barcode);
    const resolvedFormat =
      barcodeFormat === 'auto' ? (isEan ? 'ean13' : 'code128') : barcodeFormat;

    // Generate pure SVG barcode
    const barcodeSvg = generateBarcodeSvg(barcode, {
      format: resolvedFormat,
      height:
        activeTemplate.id === 'thermal-30x20'
          ? 38
          : activeTemplate.id === 'shelf-70x40'
          ? 48
          : 42,
      displayValue: showSku,
      fontSize: 10,
    });

    const formattedPrice = parseFloat(product.price).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (activeTemplate.id === 'shelf-70x40') {
      return (
        <div
          key={keyIndex}
          className="shelf-tag-item"
          style={{
            width: '70mm',
            height: '40mm',
            boxSizing: 'border-box',
            padding: '2.5mm',
            border: '1.5px solid #222',
            borderRadius: '4px',
            background: '#ffffff',
            color: '#111827',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            pageBreakInside: 'avoid',
            position: 'relative',
          }}
        >
          {/* Top Bar: Store & Promo tag */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '1mm' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#4b5563' }}>
              {showStoreName ? customStoreName : ''}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 800, background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>
              SPECIAL PRICE
            </span>
          </div>

          {/* Product Name */}
          <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2, margin: '1mm 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
          </div>

          {/* Price & Barcode Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '3mm' }}>
            {/* Left: Barcode */}
            <div style={{ flex: '1 1 55%', overflow: 'hidden' }}>
              <div
                dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                style={{ width: '100%', maxHeight: '42px' }}
              />
            </div>

            {/* Right: Big Price */}
            {showPrice && (
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <span style={{ fontSize: '9px', color: '#6b7280', display: 'block' }}>ราคาต่อ {unitText}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, marginRight: '1px' }}>฿</span>
                  <span style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {formattedPrice}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTemplate.id === 'thermal-30x20') {
      return (
        <div
          key={keyIndex}
          className="thermal-label-item"
          style={{
            width: '30mm',
            height: '20mm',
            boxSizing: 'border-box',
            padding: '1.5mm',
            border: '1px dashed #d1d5db',
            background: '#ffffff',
            color: '#111827',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            pageBreakInside: 'avoid',
          }}
        >
          {showProductName && (
            <div style={{ fontSize: '7.5px', fontWeight: 700, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.5mm' }}>
              {product.name}
            </div>
          )}
          <div
            dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            style={{ width: '100%', maxHeight: '34px', overflow: 'hidden' }}
          />
          {showPrice && (
            <div style={{ fontSize: '9px', fontWeight: 800, marginTop: '0.5mm', lineHeight: 1 }}>
              ฿{formattedPrice}
            </div>
          )}
        </div>
      );
    }

    // Default: 40x30, 50x30, or A4 label
    return (
      <div
        key={keyIndex}
        className="thermal-label-item"
        style={{
          width: `${activeTemplate.widthMm}mm`,
          height: `${activeTemplate.heightMm}mm`,
          boxSizing: 'border-box',
          padding: '2mm',
          border: '1px dashed #cbd5e1',
          background: '#ffffff',
          color: '#111827',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          pageBreakInside: 'avoid',
          borderRadius: '3px',
        }}
      >
        {/* Header: Store Name */}
        {showStoreName && (
          <div style={{ fontSize: '8px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', textAlign: 'center', borderBottom: '0.5px solid #e5e7eb', paddingBottom: '0.5mm' }}>
            {customStoreName}
          </div>
        )}

        {/* Product Name */}
        {showProductName && (
          <div style={{ fontSize: '10px', fontWeight: 700, lineHeight: 1.15, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.5mm' }}>
            {product.name}
          </div>
        )}

        {/* Barcode SVG */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0.5mm 0', overflow: 'hidden' }}>
          <div
            dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            style={{ width: '95%', maxHeight: '42px' }}
          />
        </div>

        {/* Price & Unit Footer */}
        {showPrice && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '0.5px solid #f3f4f6', paddingTop: '0.5mm', marginTop: 'auto' }}>
            <span style={{ fontSize: '8px', color: '#6b7280' }}>ต่อ{unitText}</span>
            <span style={{ fontSize: '13px', fontWeight: 900, color: '#111827' }}>
              ฿{formattedPrice}
            </span>
          </div>
        )}
      </div>
    );
  };


  const cardStyle: CSSProperties = {
    border: '1px solid #d7e5f6',
    borderRadius: '10px',
    padding: '16px',
    background: '#fff',
    minWidth: 0,
  };
  const cardTitleStyle: CSSProperties = {
    fontSize: '14px',
    margin: '0 0 12px',
    color: '#163d70',
    lineHeight: 1.5,
  };
  const fieldLabelStyle: CSSProperties = {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: '#294b76',
    display: 'grid',
    gap: '6px',
    minWidth: 0,
  };
  const fieldInputStyle: CSSProperties = {
    margin: 0,
    padding: '9px 11px',
    borderColor: '#d7e5f6',
  };
  const checkboxStyle: CSSProperties = {
    margin: 0,
    padding: '9px 10px',
    borderRadius: '8px',
    background: '#f5f8ff',
    border: '1px solid #e2ecf8',
    fontSize: '13px',
    fontWeight: 500,
    color: '#294b76',
    cursor: 'pointer',
  };
  const categoryPill = (category: LabelTemplate['category']): CSSProperties =>
    category === 'thermal'
      ? { background: '#fff5df', color: '#a36600' }
      : category === 'shelf'
      ? { background: '#e8f8ef', color: '#16825d' }
      : { background: '#eaf4ff', color: '#0768d7' };

  const printableArea = (
    <div id="printable-barcode-content" className="print-only printable-area">
      {activeTemplate.category === 'a4' ? (
        <div
          className="printable-barcode-sheet"
          style={{
            width: '210mm',
            display: 'grid',
            gridTemplateColumns: `repeat(${activeTemplate.a4Cols || 3}, 1fr)`,
            gap: '1.5mm',
          }}
        >
          {flattenedLabels.map((lbl, idx) =>
            renderSingleLabel(lbl.product, lbl.barcode, idx)
          )}
        </div>
      ) : (
        <div
          className="printable-barcode-roll"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          {flattenedLabels.map((lbl, idx) => (
            <div key={idx} className="barcode-label-cut" style={{ marginBottom: '8px' }}>
              {renderSingleLabel(lbl.product, lbl.barcode, idx)}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <dialog
        ref={dialog}
        id="barcode-studio-dialog"
        className="modal"
        aria-labelledby="barcode-studio-title"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        style={{
          width: 'min(1150px, 96vw)',
          maxWidth: '96vw',
          padding: 'clamp(16px, 4vw, 28px)',
        }}
      >
        {/* Print: hide the modal backdrop so only the printable labels appear */}
        <style>{'@media print{#barcode-studio-dialog::backdrop{background:transparent!important}}'}</style>

        {/* Header */}
        <div className="section-heading" style={{ gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <span className="eyebrow green">BARCODE STUDIO · LABEL PRINTING</span>
            <h2 id="barcode-studio-title" style={{ margin: '6px 0 4px' }}>
              ระบบพิมพ์บาร์โค้ดและป้ายราคา (Barcode Studio)
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
              สร้างสติกเกอร์บาร์โค้ดคมชัดสูงระดับ 300+ DPI และป้ายราคาติดชั้นวางสินค้า
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        {/* Body Layout: settings column + live preview column */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '18px',
            marginTop: '18px',
            alignItems: 'flex-start',
          }}
        >
          {/* Left Column: Configuration & Product Queue */}
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'grid', gap: '14px' }}>

            {/* Template Selector */}
            <section style={cardStyle}>
              <h3 style={cardTitleStyle}>1. เลือกรูปแบบและขนาดป้าย (Label Template)</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                  gap: '8px',
                }}
              >
                {LABEL_TEMPLATES.map((tmpl) => {
                  const isSelected = tmpl.id === selectedTemplateId;
                  return (
                    <button
                      type="button"
                      key={tmpl.id}
                      onClick={() => setSelectedTemplateId(tmpl.id)}
                      aria-pressed={isSelected}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        justifyContent: 'space-between',
                        gap: '6px',
                        textAlign: 'left',
                        padding: '11px 12px',
                        borderRadius: '9px',
                        border: `1px solid ${isSelected ? '#0877ee' : '#d7e5f6'}`,
                        background: isSelected ? '#eaf4ff' : '#fff',
                        boxShadow: isSelected ? '0 0 0 3px #0877ee1f' : 'none',
                        color: '#102f5d',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ display: 'grid', gap: '6px' }}>
                        <span
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                          }}
                        >
                          <strong style={{ fontSize: '13px', color: isSelected ? '#0768d7' : '#102f5d' }}>
                            {tmpl.name}
                          </strong>
                          <span
                            className="pill"
                            style={{ padding: '3px 7px', fontSize: '10px', ...categoryPill(tmpl.category) }}
                          >
                            {tmpl.badge}
                          </span>
                        </span>
                        <span className="help" style={{ fontSize: '11px', lineHeight: 1.55 }}>
                          {tmpl.description}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'ui-monospace, Consolas, monospace',
                          color: '#607a9d',
                        }}
                      >
                        {tmpl.widthMm} × {tmpl.heightMm} มม.
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Customization Options */}
            <section style={cardStyle}>
              <h3 style={cardTitleStyle}>2. การปรับแต่งองค์ประกอบ (Display Options)</h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                  gap: '8px',
                }}
              >
                <label className="checkbox-label" style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={showStoreName}
                    onChange={(e) => setShowStoreName(e.target.checked)}
                  />
                  <span>ชื่อร้านค้า</span>
                </label>

                <label className="checkbox-label" style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={(e) => setShowProductName(e.target.checked)}
                  />
                  <span>ชื่อสินค้า</span>
                </label>

                <label className="checkbox-label" style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={showSku}
                    onChange={(e) => setShowSku(e.target.checked)}
                  />
                  <span>ตัวเลขบาร์โค้ด</span>
                </label>

                <label className="checkbox-label" style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                  />
                  <span>ราคาสินค้า</span>
                </label>
              </div>

              {/* Extra Inputs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                  gap: '10px',
                  marginTop: '12px',
                }}
              >
                <label style={fieldLabelStyle}>
                  ชื่อร้านที่แสดง
                  <input
                    type="text"
                    value={customStoreName}
                    onChange={(e) => setCustomStoreName(e.target.value)}
                    disabled={!showStoreName}
                    style={{
                      ...fieldInputStyle,
                      background: showStoreName ? '#fff' : '#f3f6fb',
                    }}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  หน่วยนับ
                  <input
                    type="text"
                    value={unitText}
                    onChange={(e) => setUnitText(e.target.value)}
                    placeholder="ชิ้น / กล่อง / ขวด"
                    style={fieldInputStyle}
                  />
                </label>
              </div>

              <label style={{ ...fieldLabelStyle, marginTop: '10px' }}>
                ประเภทบาร์โค้ด
                <span style={{ display: 'grid' }}>
                  <AppSelect
                    value={barcodeFormat}
                    onChange={(e) => setBarcodeFormat(e.target.value as any)}
                  >
                    <option value="auto">อัตโนมัติ (ตรวจจับ EAN-13 / Code 128)</option>
                    <option value="ean13">EAN-13 (มาตรฐานสากล 13 หลัก)</option>
                    <option value="code128">Code 128 (รองรับตัวอักษรและ SKU)</option>
                  </AppSelect>
                </span>
              </label>
            </section>

            {/* Product Queue Management */}
            <section style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ ...cardTitleStyle, margin: 0, flex: '1 1 200px' }}>
                  3. รายการสินค้าที่จะพิมพ์ ({queue.length} รายการ / รวม {totalLabelCount} ดวง)
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleFillStockQuantity}
                    title="กำหนดจำนวนดวงพิมพ์ตามสต็อกคงเหลือ"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    📦 ตามสต็อก
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleAddAllProducts}
                    title="เพิ่มสินค้าทุกรายการในร้าน"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    + ทั้งหมด
                  </button>
                </div>
              </div>

              {/* Add Product Search Input */}
              <div style={{ position: 'relative' }}>
                <div className="search" style={{ width: '100%' }}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="ค้นหาสินค้าเพิ่มเข้าคิว (ชื่อ, SKU, บาร์โค้ด)..."
                    aria-label="ค้นหาสินค้าเพิ่มเข้าคิว"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ margin: 0, padding: '10px 12px' }}
                  />
                </div>

                {/* Dropdown Results */}
                {filteredCatalog.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '100%',
                      marginTop: '4px',
                      background: '#fff',
                      border: '1px solid #d7e5f6',
                      borderRadius: '9px',
                      boxShadow: '0 14px 34px #073e8224',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      zIndex: 20,
                    }}
                  >
                    {filteredCatalog.map((p, index) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => handleAddProductToQueue(p)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          textAlign: 'left',
                          padding: '9px 12px',
                          border: 0,
                          borderTop: index === 0 ? 0 : '1px solid #e2ecf8',
                          background: 'transparent',
                          color: '#102f5d',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{p.name}</strong>
                          <small style={{ color: '#607a9d', fontSize: '11px' }}>
                            SKU: {p.sku} | บาร์โค้ด: {p.barcode || 'ไม่มี'}
                          </small>
                        </span>
                        <span className="numeric" style={{ flexShrink: 0 }}>
                          <strong style={{ color: '#0877ee' }}>฿{p.price}</strong>
                          <small style={{ display: 'block', color: '#607a9d', fontSize: '10px' }}>
                            คลัง: {p.quantity}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Queue List */}
              <div
                style={{
                  marginTop: '10px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid #e2ecf8',
                  borderRadius: '9px',
                }}
              >
                {queue.length === 0 ? (
                  <p className="help" style={{ margin: 0, padding: '24px 16px', textAlign: 'center' }}>
                    ยังไม่มีรายการสินค้าในคิวพิมพ์ กรุณาค้นหาและเลือกสินค้า
                  </p>
                ) : (
                  queue.map((item, index) => {
                    const hasBarcode = Boolean(item.product.barcode || item.barcodeOverride);
                    return (
                      <div
                        key={item.product.id}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '10px 12px',
                          borderTop: index === 0 ? 0 : '1px solid #e2ecf8',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <strong
                            style={{
                              display: 'block',
                              color: '#102f5d',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.product.name}
                          </strong>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: '6px',
                              color: '#607a9d',
                              fontSize: '11px',
                              marginTop: '2px',
                            }}
                          >
                            <span>SKU: {item.product.sku}</span>
                            <span>•</span>
                            <span>฿{item.product.price}</span>
                            {!hasBarcode ? (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => handleGenerateBarcodeForProduct(item.product.id)}
                                style={{ padding: 0, fontSize: '11px', textDecoration: 'underline' }}
                              >
                                สุ่มบาร์โค้ด
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'ui-monospace, Consolas, monospace',
                                  color: '#16825d',
                                }}
                              >
                                [{item.barcodeOverride || item.product.barcode}]
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="quantity-controls" style={{ flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, -1)}
                            aria-label="ลดจำนวน"
                            style={{ padding: 0, color: '#075dc4', borderColor: '#d7e5f6' }}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            aria-label="จำนวนดวง"
                            onChange={(e) =>
                              handleSetQuantity(item.product.id, parseInt(e.target.value, 10) || 1)
                            }
                            style={{
                              width: '52px',
                              margin: 0,
                              padding: '4px 6px',
                              textAlign: 'center',
                              fontWeight: 700,
                              borderColor: '#d7e5f6',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, 1)}
                            aria-label="เพิ่มจำนวน"
                            style={{ padding: 0, color: '#075dc4', borderColor: '#d7e5f6' }}
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleRemoveItem(item.product.id)}
                            title="ลบออกจากคิว"
                            aria-label="ลบออกจากคิว"
                            style={{ border: 0, marginLeft: '2px', color: '#c23f45' }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Live Interactive Print Preview */}
          <div
            style={{
              flex: '1.4 1 440px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #d7e5f6',
              borderRadius: '10px',
              overflow: 'hidden',
              background: '#f5f8ff',
            }}
          >
            {/* Preview Toolbar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 14px',
                background: '#fff',
                borderBottom: '1px solid #e2ecf8',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
                <strong style={{ fontSize: '13px', color: '#163d70' }}>พรีวิวการพิมพ์ (Live Preview)</strong>
                <span className="help" style={{ fontSize: '11px' }}>
                  {activeTemplate.name} ({flattenedLabels.length} ป้าย)
                </span>
              </div>

              {/* Zoom Controls */}
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '3px',
                  background: '#eaf4ff',
                  borderRadius: '8px',
                }}
              >
                {[100, 150, 200].map((level) => {
                  const isActive = zoomLevel === level;
                  return (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setZoomLevel(level)}
                      aria-pressed={isActive}
                      style={{
                        border: 0,
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: isActive ? '#fff' : 'transparent',
                        color: isActive ? '#0877ee' : '#607a9d',
                        boxShadow: isActive ? '0 1px 3px #073e8224' : 'none',
                      }}
                    >
                      {level}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Preview Area */}
            <div
              style={{
                flex: 1,
                minHeight: '320px',
                maxHeight: '62vh',
                overflow: 'auto',
                padding: '20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
              }}
            >
              {/* A4 Sheet Preview */}
              {activeTemplate.category === 'a4' ? (
                <div
                  style={{
                    width: '210mm',
                    minHeight: '297mm',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    padding: '16px',
                    background: '#fff',
                    border: '1px solid #d7e5f6',
                    boxShadow: '0 10px 30px #073e821f',
                    transformOrigin: 'top',
                    transition: 'transform .15s ease',
                    transform: `scale(${zoomLevel / 100})`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${activeTemplate.a4Cols || 3}, 1fr)`,
                    gap: '2mm',
                    alignContent: 'start',
                  }}
                >
                  {flattenedLabels.map((lbl, idx) =>
                    renderSingleLabel(lbl.product, lbl.barcode, idx)
                  )}
                  {flattenedLabels.length === 0 && (
                    <div className="help" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 0' }}>
                      ไม่มีรายการสินค้าในคิว
                    </div>
                  )}
                </div>
              ) : (
                /* Thermal Rolls / Shelf Tag Preview */
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    justifyContent: 'center',
                    transformOrigin: 'top',
                    transition: 'transform .15s ease',
                    transform: `scale(${zoomLevel / 100})`,
                    maxWidth: '100%',
                  }}
                >
                  {flattenedLabels.map((lbl, idx) => (
                    <div key={idx} style={{ background: '#fff', boxShadow: '0 4px 12px #073e821f' }}>
                      {renderSingleLabel(lbl.product, lbl.barcode, idx)}
                    </div>
                  ))}
                  {flattenedLabels.length === 0 && (
                    <div className="help" style={{ textAlign: 'center', padding: '80px 0' }}>
                      ไม่มีรายการสินค้าในคิวพิมพ์
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="modal-actions"
          style={{
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #e2ecf8',
            paddingTop: '16px',
            marginTop: '18px',
          }}
        >
          <div className="muted" style={{ fontSize: '12px' }}>
            รวมทั้งหมด <strong style={{ color: '#102f5d' }}>{totalLabelCount}</strong> ป้าย
            {activeTemplate.category === 'a4' && (
              <span>
                {' '}(~{Math.ceil(totalLabelCount / ((activeTemplate.a4Cols || 3) * (activeTemplate.a4Rows || 8)))} แผ่น A4)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button type="button" className="secondary" onClick={onClose}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="primary"
              onClick={handlePrint}
              disabled={flattenedLabels.length === 0}
            >
              <span>🖨️ สั่งพิมพ์ป้ายสินค้า (Print)</span>
            </button>
          </div>
        </div>
      </dialog>

      {/* Hidden printable area dedicated for window.print() — portaled to <body> so the
          dialog's scroll box / max-height never clips the printed labels */}
      {createPortal(printableArea, document.body)}
    </>
  );
}
