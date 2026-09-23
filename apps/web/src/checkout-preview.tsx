import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Check,
  CreditCard,
  Landmark,
  Loader2,
  Minus,
  Percent,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Tag,
  Ticket,
  UserRound,
  X,
  QrCode,
} from 'lucide-react';
import { api, Branch, CheckoutPayload, Customer, Product, PromotionData, SaleReceipt, ValidatePromotionResult } from './api';
import { AppSelect } from './components/app-select';
import { TaxInvoiceDialog } from './tax-invoice-dialog';
import { PromptPayModal } from './promptpay-modal';

type CartLine = {
  productId: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  quantity: number;
};

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' });

export function CheckoutPreview({
  branch,
  close,
  onSaleCompleted,
}: {
  branch: Branch;
  close: () => void;
  onSaleCompleted?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('0');
  const [received, setReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [transferReference, setTransferReference] = useState('');
  const [completedReceipt, setCompletedReceipt] = useState<SaleReceipt | null>(null);
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const [showPromptPayModal, setShowPromptPayModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isMemberDiscountApplied, setIsMemberDiscountApplied] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);

  // Promotions & Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    id: string;
    name: string;
    code?: string | null;
    discountAmount: number;
  } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [showPromoList, setShowPromoList] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const productsQuery = useQuery({
    queryKey: ['products', branch.id, query],
    queryFn: () =>
      api<Product[]>(`/products?${new URLSearchParams({ branchId: branch.id, search: query })}`),
    enabled: Boolean(branch.id),
  });

  const customersQuery = useQuery({
    queryKey: ['customers', customerSearch],
    queryFn: () => api<Customer[]>(`/customers?${new URLSearchParams({ search: customerSearch })}`),
  });

  const promotionsQuery = useQuery({
    queryKey: ['promotions', branch.id],
    queryFn: () => api<PromotionData[]>(`/promotions?branchId=${branch.id}`),
    enabled: Boolean(branch.id),
  });

  const activePromotions = (promotionsQuery.data ?? []).filter(p => p.active);

  const products = (productsQuery.data ?? []).filter(p => p.active);

  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const manualDiscount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const afterManualDiscount = subtotal - manualDiscount;
  const maxRedeemable = selectedCustomer ? Math.min(selectedCustomer.points, Math.floor(afterManualDiscount)) : 0;
  const safeRedeemPoints = Math.min(redeemPoints, maxRedeemable);
  const pointsDiscount = safeRedeemPoints;
  const total = Math.max(0, afterManualDiscount - pointsDiscount);
  const change = Math.max((Number(received) || 0) - total, 0);
  const pointsEarnedEst = Math.floor(total / 50);

  function add(p: Product) {
    const stock = Number(p.quantity);
    if (stock <= 0) return;
    setCart(lines => {
      const line = lines.find(value => value.productId === p.id);
      if (!line) {
        return [
          ...lines,
          {
            productId: p.id,
            name: p.name,
            sku: p.sku,
            price: Number(p.price),
            stock,
            quantity: 1,
          },
        ];
      }
      return lines.map(value =>
        value.productId === p.id
          ? { ...value, quantity: Math.min(value.quantity + 1, stock) }
          : value
      );
    });
  }

  function adjust(productId: string, delta: number) {
    setCart(lines =>
      lines.flatMap(line => {
        if (line.productId !== productId) return [line];
        const quantity = line.quantity + delta;
        return quantity <= 0 ? [] : [{ ...line, quantity: Math.min(quantity, line.stock) }];
      })
    );
  }

  const checkoutMutation = useMutation({
    mutationFn: (payload: CheckoutPayload) => api<SaleReceipt>('/checkout', payload),
    onSuccess: async receipt => {
      setCompletedReceipt(receipt);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['movements'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ]);
      if (onSaleCompleted) onSaleCompleted();
    },
  });

  const canPay =
    cart.length > 0 &&
    (paymentMethod === 'CASH'
      ? (Number(received) || 0) >= total
      : true);

  function submitCheckout(overrideRef?: string) {
    const refToUse = overrideRef ?? transferReference.trim();
    if (paymentMethod === 'TRANSFER' && !refToUse) {
      setShowPromptPayModal(true);
      return;
    }
    if (!canPay) return;
    checkoutMutation.mutate({
      branchId: branch.id,
      customerId: selectedCustomer?.id,
      items: cart.map(item => ({ productId: item.productId, quantity: item.quantity })),
      discount: manualDiscount > 0 ? manualDiscount.toFixed(2) : '0',
      redeemPoints: safeRedeemPoints > 0 ? safeRedeemPoints : undefined,
      paymentMethod,
      receivedAmount: paymentMethod === 'CASH' ? Number(received).toFixed(2) : undefined,
      transferRef: paymentMethod === 'TRANSFER' ? refToUse : undefined,
    });
  }

  async function applyPromo(promoCode?: string, promoId?: string) {
    const code = (promoCode ?? couponCode).trim();
    if (!code && !promoId) return;
    if (subtotal <= 0) {
      setCouponMsg({ type: 'error', text: 'กรุณาเพิ่มสินค้าลงตะกร้าก่อนใช้โปรโมชัน' });
      return;
    }
    setIsApplyingCoupon(true);
    setCouponMsg(null);
    try {
      const res = await api<ValidatePromotionResult>('/promotions/validate', {
        code: code || undefined,
        promotionId: promoId,
        branchId: branch.id,
        subtotal,
      });
      setAppliedPromo({
        id: res.promotion.id,
        name: res.promotion.name,
        code: res.promotion.code,
        discountAmount: res.discountAmount,
      });
      setDiscount(res.discountAmount.toFixed(2));
      setIsMemberDiscountApplied(false);
      setCouponMsg({
        type: 'success',
        text: `ใช้โปรโมชัน "${res.promotion.name}" สำเร็จ (ลด ${money.format(res.discountAmount)})`,
      });
      setShowPromoList(false);
    } catch (err: any) {
      setCouponMsg({ type: 'error', text: err.message || 'ไม่สามารถใช้โปรโมชันนี้ได้' });
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function removePromo() {
    setAppliedPromo(null);
    setDiscount('0');
    setCouponCode('');
    setCouponMsg(null);
  }

  function resetSale() {
    setCart([]);
    setDiscount('0');
    setRedeemPoints(0);
    setReceived('');
    setTransferReference('');
    setPaymentMethod('CASH');
    setCompletedReceipt(null);
    setSelectedCustomer(null);
    setIsMemberDiscountApplied(false);
    setCustomerSearch('');
    removePromo();
  }

  return (
    <dialog
      ref={dialog}
      className="modal checkout-preview"
      aria-labelledby="checkout-preview-title"
      onCancel={event => {
        event.preventDefault();
        if (!checkoutMutation.isPending) close();
      }}
      style={{ width: 'min(1150px, 96vw)' }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow green">REAL-TIME POS · {branch.name}</span>
          <h2 id="checkout-preview-title">หน้าขายสินค้าหน้าร้าน</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label="ปิด"
          disabled={checkoutMutation.isPending}
        >
          <X />
        </button>
      </div>

      {completedReceipt ? (
        <div className="checkout-complete" style={{ padding: '30px 20px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#e4f7ed',
              color: '#218254',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Check size={32} />
          </div>
          <h3 style={{ fontSize: '20px', color: '#163d70', margin: '0 0 6px' }}>บันทึกการขายสำเร็จ</h3>
          <p style={{ color: '#607a9d', fontSize: '13px', margin: '0 0 20px' }}>
            ระบบได้บันทึกบิลและตัดสต็อกสินค้าในฐานข้อมูลเรียบร้อยแล้ว
          </p>

          <div
            style={{
              maxWidth: '460px',
              margin: '0 auto 24px',
              background: '#fff',
              border: '1px dashed #9ec7f4',
              borderRadius: '10px',
              padding: '20px',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #cfe0f5', paddingBottom: '12px', marginBottom: '12px' }}>
              <strong style={{ fontSize: '16px', color: '#163d70', display: 'block' }}>รับตังค์ POS</strong>
              <span style={{ color: '#607a9d', fontSize: '12px' }}>สาขา: {completedReceipt.branch.name}</span>
              <div style={{ fontSize: '12px', color: '#0877ee', fontWeight: 600, marginTop: '4px' }}>
                เลขที่ใบเสร็จ: {completedReceipt.receiptNumber}
              </div>
              <small style={{ color: '#8297b0' }}>
                {new Date(completedReceipt.createdAt).toLocaleString('th-TH')} · แคชเชียร์: {completedReceipt.cashier.displayName}
              </small>
              {completedReceipt.customer && (
                <div style={{ background: '#f5f8ff', border: '1px solid #dbe6f4', borderRadius: '6px', padding: '6px 10px', marginTop: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#163d70', fontWeight: 600 }}>
                    สมาชิก: {completedReceipt.customer.name} ({completedReceipt.customer.phone})
                  </div>
                  <div style={{ fontSize: '12px', color: '#16825d', fontWeight: 700, marginTop: '2px' }}>
                    ⭐ ได้รับแต้มสะสม: +{completedReceipt.customer.pointsEarned} แต้ม
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
              {completedReceipt.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{it.name}</strong>
                    <div style={{ fontSize: '11px', color: '#607a9d' }}>
                      {it.quantity} × {money.format(Number(it.price))}
                    </div>
                  </div>
                  <strong>{money.format(Number(it.subtotal))}</strong>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px dashed #cfe0f5', paddingTop: '10px', display: 'grid', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#607a9d' }}>รวมสินค้า:</span>
                <span>{money.format(Number(completedReceipt.subtotal))}</span>
              </div>
              {Number(completedReceipt.discount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c23f45' }}>
                  <span>ส่วนลด:</span>
                  <span>-{money.format(Number(completedReceipt.discount))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#0877ee', marginTop: '6px' }}>
                <span>ยอดชำระ:</span>
                <span>{money.format(Number(completedReceipt.total))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#607a9d', fontSize: '12px', marginTop: '4px' }}>
                <span>วิธีชำระ:</span>
                <span>{completedReceipt.paymentMethod === 'CASH' ? 'เงินสด' : `โอนเงิน (Ref: ${completedReceipt.transferRef || '-'})`}</span>
              </div>
              {completedReceipt.paymentMethod === 'CASH' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#607a9d', fontSize: '12px' }}>
                    <span>รับเงิน:</span>
                    <span>{money.format(Number(completedReceipt.receivedAmount))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16825d', fontWeight: 600, fontSize: '13px' }}>
                    <span>เงินทอน:</span>
                    <span>{money.format(Number(completedReceipt.change))}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowTaxDialog(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Printer size={16} /> พิมพ์ใบเสร็จ / ใบกำกับภาษี
            </button>
            <button
              type="button"
              className="primary"
              onClick={resetSale}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} /> เริ่มการขายรายการใหม่
            </button>
          </div>
        </div>
      ) : (
        <div className="checkout-grid">
          {/* ซ้าย: รายการสินค้าจาก DB จริง */}
          <section>
            <div className="search checkout-search">
              <Search size={18} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อสินค้า หรือ SKU หรือบาร์โค้ด"
                aria-label="ค้นหาสินค้า"
              />
            </div>

            {productsQuery.isLoading ? (
              <p className="muted" style={{ padding: '20px' }}>กำลังโหลดสินค้า...</p>
            ) : products.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '200px' }}>
                <p className="muted">
                  {query ? 'ไม่พบสินค้าที่ตรงกับการค้นหา' : 'ยังไม่มีสินค้าที่เปิดใช้งานในระบบ'}
                </p>
              </div>
            ) : (
              <div className="pos-products">
                {products.map(p => {
                  const stock = Number(p.quantity);
                  const isOutOfStock = stock <= 0;
                  const inCart = cart.find(c => c.productId === p.id)?.quantity ?? 0;
                  return (
                    <button
                      key={p.id}
                      className="pos-product"
                      disabled={isOutOfStock || inCart >= stock}
                      onClick={() => add(p)}
                      style={{ opacity: isOutOfStock ? 0.5 : 1 }}
                    >
                      <strong>{p.name}</strong>
                      <small>
                        {p.sku} · คงเหลือ <b style={{ color: stock <= 5 ? '#e67d00' : '#16825d' }}>{stock}</b> ชิ้น
                        {inCart > 0 && <span style={{ color: '#0877ee' }}> (ในตะกร้า {inCart})</span>}
                      </small>
                      <span>{money.format(Number(p.price))}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ขวา: ตะกร้าและชำระเงิน */}
          <section className="cart">
            <h3>
              <ShoppingCart size={18} /> ตะกร้าสินค้า ({cart.length})
            </h3>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#8297b0' }}>
                <p className="muted">คลิกเลือกสินค้าจากรายการด้านซ้ายเพื่อเริ่มคิดเงิน</p>
              </div>
            ) : (
              <>
                {/* สมาชิกลูกค้า (CRM) */}
                <div style={{ background: '#f5f8ff', border: '1px solid #dbe6f4', borderRadius: '8px', padding: '10px', margin: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#163d70', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <UserRound size={14} color="#0877ee" /> สมาชิกลูกค้าสะสมแต้ม
                    </span>
                    {selectedCustomer && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setIsMemberDiscountApplied(false);
                          setRedeemPoints(0);
                        }}
                        style={{ fontSize: '11px', color: '#c23f45', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        ยกเลิกเลือก
                      </button>
                    )}
                  </div>

                  {selectedCustomer ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ fontSize: '13px', color: '#163d70' }}>{selectedCustomer.name}</strong>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '10px',
                                background:
                                  selectedCustomer.tier === 'PLATINUM' ? '#e0f2fe' :
                                  selectedCustomer.tier === 'GOLD' ? '#fef3c7' :
                                  selectedCustomer.tier === 'SILVER' ? '#f1f5f9' : '#fef2f2',
                                color:
                                  selectedCustomer.tier === 'PLATINUM' ? '#0369a1' :
                                  selectedCustomer.tier === 'GOLD' ? '#b45309' :
                                  selectedCustomer.tier === 'SILVER' ? '#475569' : '#991b1b',
                                border: '1px solid currentColor',
                              }}
                            >
                              {selectedCustomer.tier === 'PLATINUM' ? '💎 Platinum' :
                               selectedCustomer.tier === 'GOLD' ? '🥇 Gold' :
                               selectedCustomer.tier === 'SILVER' ? '🥈 Silver' : '🥉 Bronze'}
                            </span>
                          </div>
                          <small style={{ display: 'block', color: '#607a9d', fontSize: '11px' }}>{selectedCustomer.phone}</small>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0877ee' }}>
                            {selectedCustomer.points} แต้ม
                          </span>
                          <small style={{ display: 'block', color: '#16825d', fontSize: '11px', fontWeight: 600 }}>
                            +{pointsEarnedEst} แต้มที่จะได้รับ
                          </small>
                        </div>
                      </div>

                      {/* การแลกแต้มสะสม */}
                      <div style={{ marginTop: '8px', padding: '8px', background: '#fff', border: '1px solid #d0e0f5', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#163d70' }}>
                            🎁 ใช้แต้มแลกส่วนลด (1 แต้ม = 1 บาท)
                          </span>
                          {safeRedeemPoints > 0 && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#16825d' }}>
                              ลด -{money.format(safeRedeemPoints)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxRedeemable}
                            value={redeemPoints || ''}
                            onChange={e => setRedeemPoints(Math.max(0, Math.min(maxRedeemable, Number(e.target.value) || 0)))}
                            placeholder={maxRedeemable > 0 ? `แลกได้สูงสุด ${maxRedeemable} แต้ม` : 'ไม่มีแต้มพอแลก'}
                            disabled={maxRedeemable <= 0}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid #cfe0f5' }}
                          />
                          {maxRedeemable >= 50 && (
                            <button
                              type="button"
                              className="secondary"
                              style={{ fontSize: '10px', padding: '3px 6px' }}
                              onClick={() => setRedeemPoints(50)}
                            >
                              50 แต้ม
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            style={{ fontSize: '10px', padding: '3px 6px' }}
                            onClick={() => setRedeemPoints(maxRedeemable)}
                            disabled={maxRedeemable <= 0}
                          >
                            สูงสุด ({maxRedeemable})
                          </button>
                          {safeRedeemPoints > 0 && (
                            <button
                              type="button"
                              style={{ fontSize: '10px', padding: '3px 6px', color: '#c23f45', background: 'none', border: 'none', cursor: 'pointer' }}
                              onClick={() => setRedeemPoints(0)}
                            >
                              ล้าง
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isMemberDiscountApplied) {
                              setIsMemberDiscountApplied(false);
                              setDiscount('0');
                            } else {
                              setIsMemberDiscountApplied(true);
                              const tenPct = Math.round(subtotal * 0.1);
                              setDiscount(String(tenPct));
                            }
                          }}
                          className={isMemberDiscountApplied ? 'primary' : 'secondary'}
                          style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px' }}
                        >
                          {isMemberDiscountApplied ? '✓ ส่วนลดสมาชิก 10% (เปิดใช้งาน)' : 'ใช้ส่วนลดสมาชิก 10%'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="ค้นหาเบอร์โทร หรือชื่อสมาชิก..."
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cfe0f5' }}
                      />
                      {customerSearch.trim().length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #dbe6f4', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '160px', overflowY: 'auto', marginTop: '2px' }}>
                          {(customersQuery.data ?? []).length === 0 ? (
                            <div style={{ padding: '8px 10px', fontSize: '12px', color: '#8297b0' }}>ไม่พบสมาชิกลูกค้า</div>
                          ) : (
                            (customersQuery.data ?? []).map(cust => (
                              <button
                                key={cust.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer(cust);
                                  setCustomerSearch('');
                                }}
                                style={{ width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'none', borderBottom: '1px solid #f0f4fa', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              >
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#163d70', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {cust.name}
                                    {cust.tier && (
                                      <span style={{ fontSize: '9px', color: '#64748b' }}>
                                        ({cust.tier === 'PLATINUM' ? '💎' : cust.tier === 'GOLD' ? '🥇' : cust.tier === 'SILVER' ? '🥈' : '🥉'})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#607a9d' }}>{cust.phone}</div>
                                </div>
                                <span style={{ fontSize: '11px', color: '#0877ee', fontWeight: 600 }}>{cust.points} แต้ม</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto', margin: '8px 0' }}>
                  {cart.map(item => (
                    <div className="cart-line" key={item.productId}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>{money.format(item.price)} / ชิ้น</small>
                      </div>
                      <div className="quantity-controls">
                        <button
                          type="button"
                          onClick={() => adjust(item.productId, -1)}
                          aria-label={`ลด ${item.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(item.productId, 1)}
                          disabled={item.quantity >= item.stock}
                          aria-label={`เพิ่ม ${item.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong>{money.format(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>

                {/* กล่องโปรโมชันและคูปองส่วนลด */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', margin: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Ticket size={14} color="#f59e0b" /> โปรโมชันและโค้ดส่วนลด
                    </span>
                    {activePromotions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPromoList(prev => !prev)}
                        style={{ fontSize: '11px', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showPromoList ? 'ซ่อนโปรโมชัน' : `ดูโปรโมชัน (${activePromotions.length})`}
                      </button>
                    )}
                  </div>

                  {appliedPromo ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '8px 10px' }}>
                      <div>
                        <strong style={{ fontSize: '12px', color: '#065f46', display: 'block' }}>
                          ✓ {appliedPromo.name} {appliedPromo.code ? `(${appliedPromo.code})` : ''}
                        </strong>
                        <span style={{ fontSize: '11px', color: '#047857' }}>
                          ส่วนลด {money.format(appliedPromo.discountAmount)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={removePromo}
                        style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="ใส่รหัสคูปอง (เช่น WELCOME10)"
                          value={couponCode}
                          onChange={e => setCouponCode(e.target.value.toUpperCase())}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void applyPromo(couponCode);
                            }
                          }}
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void applyPromo(couponCode)}
                          disabled={isApplyingCoupon || !couponCode.trim() || subtotal <= 0}
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isApplyingCoupon ? <Loader2 size={12} className="spinning" /> : <Tag size={12} />}
                          ใช้โค้ด
                        </button>
                      </div>

                      {showPromoList && activePromotions.length > 0 && (
                        <div style={{ marginTop: '8px', maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                          {activePromotions.map(promo => {
                            const isEligible = subtotal >= Number(promo.minSpend);
                            return (
                              <div
                                key={promo.id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '5px 8px',
                                  borderRadius: '4px',
                                  background: isEligible ? '#fff' : '#f1f5f9',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '11px',
                                }}
                              >
                                <div>
                                  <strong style={{ color: isEligible ? '#1e293b' : '#94a3b8' }}>{promo.name}</strong>
                                  {promo.code && <span style={{ marginLeft: '4px', color: '#d97706', fontWeight: 600 }}>[{promo.code}]</span>}
                                  <div style={{ color: '#64748b', fontSize: '10px' }}>
                                    {promo.discountType === 'PERCENTAGE' ? `ลด ${promo.discountValue}%` : `ลด ${money.format(promo.discountValue)}`}
                                    {promo.minSpend > 0 ? ` (ขั้นต่ำ ${money.format(promo.minSpend)})` : ''}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={!isEligible}
                                  onClick={() => void applyPromo(promo.code || undefined, promo.id)}
                                  className="secondary"
                                  style={{ padding: '2px 8px', fontSize: '10px' }}
                                >
                                  {isEligible ? 'ใช้โปรนี้' : `ขาดอีก ${money.format(Number(promo.minSpend) - subtotal)}`}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {couponMsg && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        color: couponMsg.type === 'success' ? '#059669' : '#dc2626',
                        fontWeight: 500,
                      }}
                    >
                      {couponMsg.text}
                    </div>
                  )}
                </div>

                <div className="checkout-totals">
                  <label>
                    ส่วนลดเงินสด (บาท)
                    <input
                      type="number"
                      min="0"
                      max={subtotal}
                      step="0.01"
                      value={discount}
                      onChange={event => {
                        setDiscount(event.target.value);
                        setAppliedPromo(null);
                      }}
                    />
                  </label>

                  <div>
                    <span>รวมราคาสินค้า</span>
                    <strong>{money.format(subtotal)}</strong>
                  </div>
                  {manualDiscount > 0 && (
                    <div style={{ color: '#c23f45' }}>
                      <span>ส่วนลด {appliedPromo ? `(${appliedPromo.name})` : ''}</span>
                      <strong>-{money.format(manualDiscount)}</strong>
                    </div>
                  )}

                  {pointsDiscount > 0 && (
                    <div style={{ color: '#16825d', display: 'flex', justifyContent: 'space-between' }}>
                      <span>ส่วนลดจากแต้มสะสม ({safeRedeemPoints} แต้ม)</span>
                      <strong>-{money.format(pointsDiscount)}</strong>
                    </div>
                  )}

                  <div className="grand-total">
                    <span>ยอดชำระสุทธิ</span>
                    <strong>{money.format(total)}</strong>
                  </div>

                  <label>
                    วิธีชำระเงิน
                    <AppSelect
                      icon={paymentMethod === 'TRANSFER' ? <Landmark size={16} /> : <CreditCard size={16} />}
                      value={paymentMethod}
                      onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}
                    >
                      <option value="CASH">เงินสด (Cash)</option>
                      <option value="TRANSFER">โอนเงิน / QR Code</option>
                    </AppSelect>
                  </label>

                  {paymentMethod === 'CASH' ? (
                    <>
                      <label>
                        รับเงินสดจากลูกค้า (บาท)
                        <input
                          type="number"
                          min={total}
                          step="0.01"
                          value={received}
                          onChange={event => setReceived(event.target.value)}
                          placeholder={total.toFixed(2)}
                        />
                      </label>
                      {Number(received) > 0 && (
                        <div style={{ color: '#16825d', fontWeight: 600, fontSize: '14px' }}>
                          <span>เงินทอน</span>
                          <strong>{money.format(change)}</strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <section className="transfer-payment">
                      <strong>
                        <Landmark size={16} /> ชำระผ่านการโอน / QR
                      </strong>

                      <button
                        type="button"
                        onClick={() => setShowPromptPayModal(true)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          marginTop: '8px',
                          marginBottom: '8px',
                          background: 'linear-gradient(135deg, #0b2046 0%, #17428b 100%)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(11,32,70,0.25)',
                        }}
                      >
                        <QrCode size={18} />
                        <span>แสดง QR พร้อมเพย์ (฿{total.toFixed(2)})</span>
                      </button>

                      <label>
                        เลขอ้างอิงการโอน หรือเวลาในสลิป
                        <input
                          value={transferReference}
                          onChange={event => setTransferReference(event.target.value)}
                          maxLength={50}
                          placeholder="เช่น เวลา 12:45 หรือ Ref. 8839"
                        />
                      </label>
                    </section>
                  )}

                  {checkoutMutation.error && (
                    <p role="alert" className="error" style={{ margin: '8px 0' }}>
                      {checkoutMutation.error instanceof Error
                        ? checkoutMutation.error.message
                        : 'ทำรายการขายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
                    </p>
                  )}

                  <button
                    className="primary"
                    disabled={!canPay || checkoutMutation.isPending}
                    onClick={() => submitCheckout()}
                    style={{ marginTop: '10px' }}
                  >
                    {checkoutMutation.isPending
                      ? 'กำลังบันทึกการขายและตัดสต็อก…'
                      : paymentMethod === 'CASH'
                      ? `ชำระเงินสด (${money.format(total)})`
                      : 'ยืนยันการโอนเงิน'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {showTaxDialog && completedReceipt && (
        <TaxInvoiceDialog
          sale={{
            id: completedReceipt.id,
            receiptNumber: completedReceipt.receiptNumber,
            status: 'COMPLETED',
            createdAt: completedReceipt.createdAt,
            branchName: branch.name,
            cashierName: 'พนักงานขาย',
            voidedAt: null,
            voidedByName: null,
            voidReason: null,
            customer: selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name, phone: selectedCustomer.phone } : null,
            subtotal: completedReceipt.subtotal,
            discount: completedReceipt.discount,
            total: completedReceipt.total,
            paymentMethod: completedReceipt.paymentMethod,
            items: completedReceipt.items,
          }}
          branch={branch}
          close={() => setShowTaxDialog(false)}
        />
      )}
      {showPromptPayModal && (
        <PromptPayModal
          branch={branch}
          amount={total}
          ref1={`SALE${Date.now().toString().slice(-6)}`}
          onConfirmPayment={(detail) => {
            setTransferReference(detail.transferRef);
            setShowPromptPayModal(false);
            submitCheckout(detail.transferRef);
          }}
          onClose={() => setShowPromptPayModal(false)}
        />
      )}
    </dialog>
  );
}
