import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FileText,
  History,
  Info,
  Loader2,
  Package,
  Printer,
  RotateCcw,
  ShieldAlert,
  Undo2,
  User,
  X,
} from 'lucide-react';
import {
  Branch,
  createSaleReturn,
  CreateSaleReturnPayload,
  getReturnableItems,
  getSaleReturns,
  ReturnableItem,
  SaleReturn,
  SaleReturnListItem,
} from './api';
import { bahtText } from './baht-text';

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

export function RefundDialog({
  saleId,
  receiptNumber,
  branch,
  role,
  close,
  onSuccess,
}: {
  saleId: string;
  receiptNumber: string;
  branch: Branch;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  close: () => void;
  onSuccess?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'return' | 'history' | 'receipt'>('return');
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null);

  // Form state
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [restockMap, setRestockMap] = useState<Record<string, boolean>>({});
  const [conditionMap, setConditionMap] = useState<Record<string, 'RESTOCKABLE' | 'DAMAGED'>>({});
  const [refundMethod, setRefundMethod] = useState<'ORIGINAL_PAYMENT' | 'CASH' | 'TRANSFER' | 'CREDIT_CARD'>('ORIGINAL_PAYMENT');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  // Fetch returnable items
  const returnableQuery = useQuery({
    queryKey: ['returnable-items', saleId],
    queryFn: () => getReturnableItems(saleId),
  });

  // Fetch past returns for this sale
  const returnsHistoryQuery = useQuery({
    queryKey: ['sale-returns', saleId],
    queryFn: () => getSaleReturns(saleId),
  });

  const saleInfo = returnableQuery.data?.sale;
  const returnableItems = useMemo(() => returnableQuery.data?.items ?? [], [returnableQuery.data]);
  const pastReturns = returnsHistoryQuery.data?.returns ?? [];

  // Initialize form default selections
  useEffect(() => {
    if (returnableItems.length > 0) {
      const qMap: Record<string, number> = {};
      const rMap: Record<string, boolean> = {};
      const cMap: Record<string, 'RESTOCKABLE' | 'DAMAGED'> = {};
      returnableItems.forEach(item => {
        qMap[item.saleItemId] = 0;
        rMap[item.saleItemId] = true;
        cMap[item.saleItemId] = 'RESTOCKABLE';
      });
      setSelectedQuantities(qMap);
      setRestockMap(rMap);
      setConditionMap(cMap);
    }
  }, [returnableItems]);

  const canRefund = role === 'OWNER' || role === 'MANAGER';

  // Live calculation of refund amount
  const calculations = useMemo(() => {
    if (!saleInfo) return { totalQty: 0, subtotalRefund: 0, discountRefund: 0, totalRefund: 0, vatRefund: 0, pointsDeducted: 0 };

    let totalQty = 0;
    let subtotalRefund = 0;

    const saleTotal = saleInfo.total;
    const saleSubtotal = saleInfo.subtotal;
    const saleDiscount = saleInfo.discount;
    const discountRatio = saleSubtotal > 0 ? saleDiscount / saleSubtotal : 0;

    returnableItems.forEach(item => {
      const qty = selectedQuantities[item.saleItemId] || 0;
      if (qty > 0) {
        totalQty += qty;
        subtotalRefund += item.unitPrice * qty;
      }
    });

    const discountRefund = Math.round(subtotalRefund * discountRatio * 100) / 100;
    const totalRefund = Math.max(0, subtotalRefund - discountRefund);
    const vatRefund = Math.round((totalRefund * 7 / 107) * 100) / 100;

    // Estimate points deduction
    let pointsDeducted = 0;
    if (saleInfo.customer && saleInfo.pointsEarned > 0 && saleTotal > 0) {
      pointsDeducted = Math.floor((totalRefund / saleTotal) * saleInfo.pointsEarned);
    }

    return {
      totalQty,
      subtotalRefund,
      discountRefund,
      totalRefund,
      vatRefund,
      pointsDeducted,
    };
  }, [saleInfo, returnableItems, selectedQuantities]);

  // Mutation to create return
  const createMutation = useMutation({
    mutationFn: (payload: CreateSaleReturnPayload) => createSaleReturn(saleId, payload),
    onSuccess: (data) => {
      setConfirmModal(false);
      setSelectedReturn(data);
      setActiveTab('receipt');
      queryClient.invalidateQueries({ queryKey: ['returnable-items', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sale-returns', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sales', branch.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSuccess?.();
    },
    onError: (err: any) => {
      setConfirmModal(false);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการทำรายการคืนสินค้า');
    },
  });

  const handleSelectAll = (item: ReturnableItem) => {
    setSelectedQuantities(prev => ({
      ...prev,
      [item.saleItemId]: item.remainingQuantity,
    }));
  };

  const handleClearAll = () => {
    const qMap: Record<string, number> = {};
    returnableItems.forEach(it => { qMap[it.saleItemId] = 0; });
    setSelectedQuantities(qMap);
  };

  const handleReturnAllItems = () => {
    const qMap: Record<string, number> = {};
    returnableItems.forEach(it => { qMap[it.saleItemId] = it.remainingQuantity; });
    setSelectedQuantities(qMap);
  };

  const handleConfirmSubmit = () => {
    if (!canRefund) {
      setFormError('เฉพาะ Manager หรือ Owner เท่านั้นที่สามารถทำรายการคืนสินค้าได้');
      return;
    }

    if (calculations.totalQty === 0) {
      setFormError('กรุณาเลือกจำนวนสินค้าที่ต้องการคืนอย่างน้อย 1 รายการ');
      return;
    }

    if (!reason.trim()) {
      setFormError('กรุณาระบุเหตุผลการคืนสินค้า');
      return;
    }

    const itemsPayload = returnableItems
      .filter(item => (selectedQuantities[item.saleItemId] || 0) > 0)
      .map(item => ({
        saleItemId: item.saleItemId,
        quantity: String(selectedQuantities[item.saleItemId]),
        restock: restockMap[item.saleItemId] !== false,
        condition: conditionMap[item.saleItemId] || 'RESTOCKABLE',
      }));

    createMutation.mutate({
      refundMethod,
      reason: reason.trim(),
      items: itemsPayload,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const reasonChips = [
    'ลูกค้าเปลี่ยนใจ สินค้ายังไม่เปิดใช้งาน',
    'สินค้าชำรุดเสียหาย / มีตำหนิ',
    'สินค้าหมดอายุ / เสื่อมคุณภาพ',
    'พนักงานคีย์บิลซ้ำ / คิดเงินผิด',
    'ลูกค้าสั่งผิดขนาด / ผิดรุ่น',
  ];

  return (
    <dialog
      ref={dialog}
      className="modal"
      style={{
        width: 'min(920px, 96vw)',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      }}
      onCancel={close}
    >
      {/* Dialog Header */}
      <div
        style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)',
            }}
          >
            <RotateCcw size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                คืนสินค้าและคืนเงิน (Partial Return & Refund)
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#fef3c7',
                  color: '#b45309',
                }}
              >
                บิล {receiptNumber}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              บันทึกการรับคืนสินค้าบางส่วน/ทั้งหมด ออกใบลดหนี้ (Credit Note) คืนสต็อก และหักแต้มอัตโนมัติ
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '8px',
            color: '#cbd5e1',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="ปิด"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('return')}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: activeTab === 'return' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'return' ? '#b45309' : '#64748b',
            }}
          >
            <RotateCcw size={15} /> ทำรายการคืนสินค้า
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: activeTab === 'history' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'history' ? '#b45309' : '#64748b',
            }}
          >
            <History size={15} /> ประวัติการคืนของบิลนี้ ({pastReturns.length})
          </button>

          {selectedReturn && (
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderBottom: activeTab === 'receipt' ? '2px solid #f59e0b' : '2px solid transparent',
                color: activeTab === 'receipt' ? '#b45309' : '#64748b',
              }}
            >
              <FileText size={15} /> ใบลดหนี้ #{selectedReturn.returnNumber}
            </button>
          )}
        </div>

        {activeTab === 'receipt' && (
          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Printer size={14} /> พิมพ์ใบลดหนี้
          </button>
        )}
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f1f5f9' }}>
        {/* Permission Notice */}
        {!canRefund && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            <ShieldAlert size={20} />
            <span>
              <strong>สิทธิ์การใช้งาน:</strong> เฉพาะบัญชีบทบาท <strong>Manager</strong> หรือ <strong>Owner</strong> เท่านั้นที่สามารถทำรายการคืนสินค้าและคืนเงินได้
            </span>
          </div>
        )}

        {/* TAB 1: Make Return */}
        {activeTab === 'return' && (
          <div>
            {returnableQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                <Loader2 className="spinner" size={32} style={{ margin: '0 auto 12px' }} />
                <p>กำลังโหลดข้อมูลรายการสินค้า...</p>
              </div>
            ) : returnableQuery.isError ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <AlertCircle size={18} />
                  <span>เกิดข้อผิดพลาดในการโหลดข้อมูล</span>
                </div>
                <p style={{ margin: '6px 0 0' }}>{(returnableQuery.error as any)?.message}</p>
              </div>
            ) : returnableItems.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '40px 24px',
                  textAlign: 'center',
                  border: '1px solid #e2e8f0',
                }}
              >
                <CheckCircle2 size={48} style={{ color: '#10b981', margin: '0 auto 12px' }} />
                <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: '#0f172a' }}>
                  บิลขายนี้คืนสินค้าครบทุกรายการแล้ว
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  ไม่มีสินค้าคงเหลือที่สามารถทำรายการคืนได้สำหรับบิล {receiptNumber}
                </p>
                {pastReturns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    style={{
                      marginTop: '16px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#e0f2fe',
                      color: '#0284c7',
                      border: '1px solid #bae6fd',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ดูประวัติการคืนของบิลนี้ ({pastReturns.length} รายการ)
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                {/* Left Column: Items selection table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Bill Summary Banner */}
                  {saleInfo && (
                    <div
                      style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        padding: '14px 18px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>บิลขายเดิม</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{saleInfo.receiptNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          ยอดเดิม: {money.format(saleInfo.total)} · ชำระ: {saleInfo.paymentMethod === 'TRANSFER' ? 'เงินโอน' : 'เงินสด'}
                        </div>
                      </div>

                      {saleInfo.customer && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            padding: '6px 12px',
                          }}
                        >
                          <User size={16} color="#16a34a" />
                          <div style={{ fontSize: '12px' }}>
                            <strong style={{ color: '#166534' }}>{saleInfo.customer.name}</strong>
                            <div style={{ fontSize: '10px', color: '#15803d' }}>
                              แต้มปัจจุบัน: {saleInfo.customer.points} แต้ม
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Item Selection Card */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 18px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Package size={16} color="#64748b" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                          เลือกสินค้าและจำนวนที่ต้องการคืน
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={handleReturnAllItems}
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          คืนทั้งหมด
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAll}
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                          }}
                        >
                          ล้างค่า
                        </button>
                      </div>
                    </div>

                    <div style={{ padding: '8px 16px' }}>
                      {returnableItems.map((item) => {
                        const currentQty = selectedQuantities[item.saleItemId] || 0;
                        const isRestock = restockMap[item.saleItemId] !== false;
                        const condition = conditionMap[item.saleItemId] || 'RESTOCKABLE';

                        return (
                          <div
                            key={item.saleItemId}
                            style={{
                              padding: '14px 0',
                              borderBottom: '1px solid #f1f5f9',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                                  {item.productName}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                  SKU: {item.sku} · ราคา {money.format(item.unitPrice)} / ชิ้น
                                </div>
                                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                  ซื้อ {item.originalQuantity} ชิ้น
                                  {item.returnedQuantity > 0 && (
                                    <span style={{ color: '#d97706', fontWeight: 600 }}>
                                      {' '}(เคยคืนแล้ว {item.returnedQuantity} ชิ้น)
                                    </span>
                                  )}
                                  {' · '}
                                  <strong style={{ color: '#0284c7' }}>คืนได้สูงสุด {item.remainingQuantity} ชิ้น</strong>
                                </div>
                              </div>

                              {/* Quantity Selector */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedQuantities(prev => ({
                                        ...prev,
                                        [item.saleItemId]: Math.max(0, currentQty - 1),
                                      }))
                                    }
                                    style={{
                                      width: '28px',
                                      height: '32px',
                                      background: '#f8fafc',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={item.remainingQuantity}
                                    value={currentQty}
                                    onChange={(e) => {
                                      const val = Math.min(item.remainingQuantity, Math.max(0, parseInt(e.target.value, 10) || 0));
                                      setSelectedQuantities(prev => ({ ...prev, [item.saleItemId]: val }));
                                    }}
                                    style={{
                                      width: '45px',
                                      height: '32px',
                                      textAlign: 'center',
                                      border: 'none',
                                      fontWeight: 700,
                                      fontSize: '13px',
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedQuantities(prev => ({
                                        ...prev,
                                        [item.saleItemId]: Math.min(item.remainingQuantity, currentQty + 1),
                                      }))
                                    }
                                    style={{
                                      width: '28px',
                                      height: '32px',
                                      background: '#f8fafc',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    +
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSelectAll(item)}
                                  style={{
                                    fontSize: '11px',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: currentQty === item.remainingQuantity ? '#dbeafe' : '#f1f5f9',
                                    color: currentQty === item.remainingQuantity ? '#1e40af' : '#475569',
                                    border: '1px solid #cbd5e1',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                  }}
                                >
                                  ทั้งหมด
                                </button>
                              </div>
                            </div>

                            {/* Options when qty > 0 */}
                            {currentQty > 0 && (
                              <div
                                style={{
                                  background: '#f8fafc',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  border: '1px dashed #cbd5e1',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: '12px',
                                }}
                              >
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={isRestock}
                                    onChange={(e) =>
                                      setRestockMap(prev => ({ ...prev, [item.saleItemId]: e.target.checked }))
                                    }
                                  />
                                  <span>คืนสินค้าเข้าสต็อกสาขา</span>
                                </label>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>สภาพสินค้า:</span>
                                  <select
                                    value={condition}
                                    onChange={(e) =>
                                      setConditionMap(prev => ({
                                        ...prev,
                                        [item.saleItemId]: e.target.value as 'RESTOCKABLE' | 'DAMAGED',
                                      }))
                                    }
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid #cbd5e1',
                                    }}
                                  >
                                    <option value="RESTOCKABLE">สภาพสมบูรณ์ (พร้อมขายต่อ)</option>
                                    <option value="DAMAGED">ชำรุด/เสียหาย (ไม่นำขายต่อ)</option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reason & Refund Note */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '16px 18px',
                    }}
                  >
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                      เหตุผลการคืนสินค้า *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ระบุเหตุผล เช่น ลูกค้าเปลี่ยนใจ, คีย์รายการผิด, สินค้าชำรุด"
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />

                    {/* Quick chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {reasonChips.map(chip => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setReason(chip)}
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: reason === chip ? '#fef3c7' : '#f1f5f9',
                            color: reason === chip ? '#b45309' : '#475569',
                            border: '1px solid',
                            borderColor: reason === chip ? '#fde68a' : '#e2e8f0',
                            cursor: 'pointer',
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Refund Summary & Payment Method */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Payment Method Selector */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '16px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '10px' }}>
                      ช่องทางการคืนเงิน
                    </span>

                    <div style={{ display: 'grid', gap: '8px' }}>
                      {[
                        { id: 'ORIGINAL_PAYMENT', label: `ตามช่องทางเดิม (${saleInfo?.paymentMethod === 'TRANSFER' ? 'เงินโอน' : 'เงินสด'})`, icon: Undo2 },
                        { id: 'CASH', label: 'เงินสด (Cash)', icon: Coins },
                        { id: 'TRANSFER', label: 'โอนเงิน (Bank Transfer)', icon: RotateCcw },
                        { id: 'CREDIT_CARD', label: 'บัตรเครดิต (Credit Card)', icon: CreditCard },
                      ].map(method => {
                        const Icon = method.icon;
                        const isSelected = refundMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setRefundMethod(method.id as any)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              border: isSelected ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                              background: isSelected ? '#fffbeb' : '#ffffff',
                              color: isSelected ? '#b45309' : '#334155',
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <Icon size={16} />
                            <span>{method.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '18px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '12px' }}>
                      สรุปยอดคืนเงิน (Refund Summary)
                    </span>

                    <div style={{ display: 'grid', gap: '8px', fontSize: '12px', color: '#475569' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>จำนวนชิ้นที่คืน:</span>
                        <strong style={{ color: '#0f172a' }}>{calculations.totalQty} ชิ้น</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>มูลค่าสินค้ารวม:</span>
                        <span>{money.format(calculations.subtotalRefund)}</span>
                      </div>

                      {calculations.discountRefund > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                          <span>หักส่วนลดเฉลี่ย:</span>
                          <span>-{money.format(calculations.discountRefund)}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                        <span>ภาษีมูลค่าเพิ่ม 7% (ในยอด):</span>
                        <span>{money.format(calculations.vatRefund)}</span>
                      </div>

                      {calculations.pointsDeducted > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            background: '#fef2f2',
                            borderRadius: '6px',
                            color: '#b91c1c',
                            fontWeight: 600,
                            marginTop: '4px',
                          }}
                        >
                          <span>หักแต้มสะสมคืน:</span>
                          <span>-{calculations.pointsDeducted} แต้ม</span>
                        </div>
                      )}

                      <div style={{ height: '1px', background: '#e2e8f0', margin: '6px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>ยอดคืนสุทธิ:</span>
                        <span style={{ fontWeight: 800, fontSize: '20px', color: '#b45309' }}>
                          {money.format(calculations.totalRefund)}
                        </span>
                      </div>
                    </div>

                    {formError && (
                      <div
                        role="alert"
                        style={{
                          marginTop: '12px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#b91c1c',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <AlertCircle size={15} />
                        <span>{formError}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!canRefund || calculations.totalQty === 0 || createMutation.isPending}
                      onClick={() => {
                        if (!reason.trim()) {
                          setFormError('กรุณาระบุเหตุผลการคืนสินค้า');
                          return;
                        }
                        setConfirmModal(true);
                      }}
                      style={{
                        width: '100%',
                        marginTop: '16px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: canRefund && calculations.totalQty > 0 ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#cbd5e1',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: canRefund && calculations.totalQty > 0 ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: canRefund && calculations.totalQty > 0 ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
                      }}
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="spinner" size={18} /> กำลังบันทึก...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={18} /> ยืนยันการคืนสินค้า {money.format(calculations.totalRefund)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Past Returns for this Sale */}
        {activeTab === 'history' && (
          <div>
            {returnsHistoryQuery.isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
                <Loader2 className="spinner" size={32} style={{ margin: '0 auto 12px' }} />
                <p>กำลังโหลดประวัติการคืน...</p>
              </div>
            ) : pastReturns.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '48px 24px',
                  textAlign: 'center',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Info size={40} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: '#0f172a' }}>
                  ยังไม่มีประวัติการคืนสินค้าในบิลนี้
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  บิล {receiptNumber} ยังไม่เคยมีการทำรายการคืนสินค้าหรือออกใบลดหนี้
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {pastReturns.map((ret) => (
                  <div
                    key={ret.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#0f172a',
                            }}
                          >
                            ใบลดหนี้เลขที่: {ret.returnNumber}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: '#e0f2fe',
                              color: '#0284c7',
                            }}
                          >
                            {ret.refundMethod === 'TRANSFER' ? 'เงินโอน' : ret.refundMethod === 'CREDIT_CARD' ? 'บัตรเครดิต' : 'เงินสด'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          วันที่: {new Date(ret.createdAt).toLocaleString('th-TH')} · ผู้ทำรายการ: {ret.processedBy}
                        </div>
                        <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                          <strong>เหตุผล:</strong> {ret.reason}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309' }}>
                          {money.format(ret.totalRefund)}
                        </div>
                        {ret.pointsDeducted > 0 && (
                          <div style={{ fontSize: '11px', color: '#dc2626' }}>
                            หักแต้มคืน {ret.pointsDeducted} แต้ม
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturn({
                              ...ret,
                              saleId,
                              subtotalRefund: ret.totalRefund,
                              vatRefund: Math.round((ret.totalRefund * 7 / 107) * 100) / 100,
                              customer: saleInfo?.customer ? { id: saleInfo.customer.id, name: saleInfo.customer.name, phone: saleInfo.customer.phone } : null,
                              items: ret.items.map((it, idx) => ({
                                id: `item-${idx}`,
                                productName: it.productName,
                                sku: it.sku,
                                quantity: it.quantity,
                                unitPrice: it.refundAmount / it.quantity,
                                discount: 0,
                                refundAmount: it.refundAmount,
                                restock: it.restock,
                                condition: it.condition as any,
                              })),
                            } as any);
                            setActiveTab('receipt');
                          }}
                          style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: '#f8fafc',
                            color: '#0284c7',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                          }}
                        >
                          ดู / พิมพ์ใบลดหนี้
                        </button>
                      </div>
                    </div>

                    {/* Returned items in this record */}
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #f1f5f9',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                        รายการสินค้าที่คืน ({ret.itemCount} รายการ):
                      </div>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        {ret.items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>
                              {item.productName} × {item.quantity} ชิ้น
                              <span style={{ fontSize: '10px', color: item.restock ? '#16a34a' : '#94a3b8', marginLeft: '6px' }}>
                                ({item.restock ? 'นำเข้าสต็อก' : 'ไม่นำเข้าสต็อก'})
                              </span>
                            </span>
                            <span style={{ fontWeight: 600 }}>{money.format(item.refundAmount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Credit Note Receipt View */}
        {activeTab === 'receipt' && selectedReturn && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              ref={printAreaRef}
              id="printable-credit-note"
              style={{
                width: '360px',
                background: '#ffffff',
                padding: '24px 20px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                fontFamily: 'monospace, sans-serif',
                fontSize: '12px',
                color: '#0f172a',
                lineHeight: 1.5,
              }}
            >
              {/* Slip Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #94a3b8', paddingBottom: '12px', marginBottom: '12px' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800 }}>ใบลดหนี้ / ใบรับคืนสินค้า</h3>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>CREDIT NOTE</div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                  {branch.name} · RubTang POS
                </div>
              </div>

              {/* Document Meta */}
              <div style={{ display: 'grid', gap: '3px', fontSize: '11px', borderBottom: '1px dashed #94a3b8', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>เลขที่ใบลดหนี้:</span>
                  <strong>{selectedReturn.returnNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>อ้างอิงบิลขาย:</span>
                  <span>{selectedReturn.receiptNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>วันที่คืน:</span>
                  <span>{new Date(selectedReturn.createdAt).toLocaleString('th-TH')}</span>
                </div>
                {selectedReturn.customer && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ลูกค้า:</span>
                    <span>{selectedReturn.customer.name}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>ช่องทางคืนเงิน:</span>
                  <span>{selectedReturn.refundMethod}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>เหตุผล:</span>
                  <span>{selectedReturn.reason}</span>
                </div>
              </div>

              {/* Items List */}
              <div style={{ borderBottom: '1px dashed #94a3b8', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '6px' }}>
                  <span>รายการสินค้าที่คืน</span>
                  <span>จำนวนเงิน</span>
                </div>
                {selectedReturn.items.map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{item.productName}</span>
                      <span>{money.format(item.refundAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>
                        {item.quantity} × {money.format(item.unitPrice)}
                        {item.discount > 0 && ` (ลด ${money.format(item.discount)})`}
                      </span>
                      <span>{item.restock ? '[คืนสต็อก]' : '[ชำรุด]'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ display: 'grid', gap: '4px', fontSize: '11px', borderBottom: '1px dashed #94a3b8', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>มูลค่าสินค้าคืน:</span>
                  <span>{money.format(selectedReturn.subtotalRefund)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                  <span>ภาษีมูลค่าเพิ่ม 7%:</span>
                  <span>{money.format(selectedReturn.vatRefund)}</span>
                </div>
                {selectedReturn.pointsDeducted > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                    <span>หักแต้มสะสมคืน:</span>
                    <span>-{selectedReturn.pointsDeducted} แต้ม</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, marginTop: '4px' }}>
                  <span>ยอดคืนเงินสุทธิ:</span>
                  <span>{money.format(selectedReturn.totalRefund)}</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                  ({bahtText(selectedReturn.totalRefund)})
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', fontSize: '10px', color: '#64748b', marginTop: '12px' }}>
                <div>เอกสารนี้ออกโดยระบบ RubTang POS</div>
                <div>ขอบคุณที่ใช้บริการ</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <dialog
          open
          className="modal"
          style={{ width: 'min(450px, 92vw)', zIndex: 1100 }}
          onCancel={() => setConfirmModal(false)}
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow" style={{ color: '#d97706' }}>CONFIRM REFUND</span>
              <h3 style={{ margin: '4px 0 0', color: '#163d70' }}>ยืนยันการคืนสินค้าและคืนเงิน</h3>
            </div>
            <button className="icon-button" onClick={() => setConfirmModal(false)} aria-label="ปิด">
              <X />
            </button>
          </div>

          <div style={{ margin: '14px 0', fontSize: '13px', color: '#334155', display: 'grid', gap: '8px' }}>
            <p style={{ margin: 0 }}>
              คุณกำลังจะดำเนินการคืนสินค้าจำนวน <strong>{calculations.totalQty} ชิ้น</strong> จากบิล <strong>{receiptNumber}</strong>
            </p>
            <div style={{ padding: '10px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>ยอดเงินที่ต้องคืนลูกค้า:</span>
                <span style={{ color: '#b45309', fontSize: '16px' }}>{money.format(calculations.totalRefund)}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#92400e', marginTop: '4px' }}>
                ช่องทาง: {refundMethod === 'TRANSFER' ? 'เงินโอน' : refundMethod === 'CREDIT_CARD' ? 'บัตรเครดิต' : 'เงินสด'}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              เมื่อยืนยันแล้ว ระบบจะออกใบลดหนี้ (Credit Note), นำสินค้าเข้าสต็อกคงเหลือ (ตามที่เลือก) และหักแต้มสะสมคืนโดยอัตโนมัติ
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirmModal(false)}
              disabled={createMutation.isPending}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={createMutation.isPending}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {createMutation.isPending ? <Loader2 className="spinner" size={16} /> : <RotateCcw size={16} />}
              ยืนยันการคืนเงิน
            </button>
          </div>
        </dialog>
      )}
    </dialog>
  );
}
