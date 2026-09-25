import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Minus,
  Plus,
  Receipt,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import {
  getPublicTableSession,
  submitPublicTableOrder,
  PublicTableSession,
} from './api';
import logo from './assets/logo_rub_tung.png';

interface CustomerOrderScreenProps {
  sessionToken: string;
}

export function CustomerOrderScreen({ sessionToken }: CustomerOrderScreenProps) {
  const [activeTab, setActiveTab] = useState<'MENU' | 'TRACKING'>('MENU');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Record<string, { quantity: number; note: string }>>({});
  const [orderNote, setOrderNote] = useState('');
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [orderSuccessNotice, setOrderSuccessNotice] = useState(false);

  // Fetch session & menu
  const { data: sessionData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public-table-session', sessionToken],
    queryFn: () => getPublicTableSession(sessionToken),
    refetchInterval: 10_000, // Sync status every 10s
  });

  // Filtered menu
  const filteredMenu = useMemo(() => {
    if (!sessionData?.menu) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessionData.menu;
    return sessionData.menu.filter(item =>
      item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q),
    );
  }, [sessionData?.menu, searchQuery]);

  // Cart totals
  const cartSummary = useMemo(() => {
    if (!sessionData?.menu) return { totalQty: 0, totalPrice: 0, items: [] };
    let totalQty = 0;
    let totalPrice = 0;
    const items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      note: string;
      subtotal: number;
    }> = [];

    for (const [prodId, entry] of Object.entries(cart)) {
      if (entry.quantity > 0) {
        const prod = sessionData.menu.find(m => m.id === prodId);
        if (prod) {
          const subtotal = prod.price * entry.quantity;
          totalQty += entry.quantity;
          totalPrice += subtotal;
          items.push({
            id: prod.id,
            name: prod.name,
            price: prod.price,
            quantity: entry.quantity,
            note: entry.note,
            subtotal,
          });
        }
      }
    }

    return { totalQty, totalPrice, items };
  }, [cart, sessionData?.menu]);

  // Cart actions
  const addToCart = (productId: string) => {
    setCart(prev => {
      const current = prev[productId] || { quantity: 0, note: '' };
      return {
        ...prev,
        [productId]: { ...current, quantity: current.quantity + 1 },
      };
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const current = prev[productId];
      if (!current || current.quantity <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return {
        ...prev,
        [productId]: { ...current, quantity: current.quantity - 1 },
      };
    });
  };

  const updateItemNote = (productId: string, note: string) => {
    setCart(prev => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: { ...current, note },
      };
    });
  };

  // Submit order mutation
  const submitOrderMutation = useMutation({
    mutationFn: () => {
      const items = cartSummary.items.map(i => ({
        productId: i.id,
        quantity: i.quantity,
        note: i.note ? i.note.trim() : undefined,
      }));
      return submitPublicTableOrder(sessionToken, {
        items,
        note: orderNote.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setCart({});
      setOrderNote('');
      setShowCartDrawer(false);
      setOrderSuccessNotice(true);
      await refetch();
      setTimeout(() => setOrderSuccessNotice(false), 5000);
      setActiveTab('TRACKING');
    },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f8ff', padding: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <img src={logo} alt="รับตังค์" style={{ width: '56px', height: '56px', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '16px', color: '#102f5d', margin: '0 0 6px' }}>กำลังโหลดเมนูอาหาร…</h2>
          <p style={{ fontSize: '12px', color: '#607a9d', margin: 0 }}>กรุณารอสักครู่ ระบบกำลังเชื่อมต่อโต๊ะของคุณ</p>
        </div>
      </div>
    );
  }

  if (isError || !sessionData) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f8ff', padding: '20px' }}>
        <div style={{ maxWidth: '380px', textAlign: 'center', background: '#fff', padding: '32px 24px', borderRadius: '16px', border: '1px solid #d7e5f6' }}>
          <AlertCircle size={48} color="#c94a4a" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', color: '#102f5d', margin: '0 0 8px' }}>ไม่สามารถเปิดเมนูได้</h2>
          <p style={{ fontSize: '13px', color: '#607a9d', margin: '0 0 20px', lineHeight: 1.6 }}>
            {error instanceof Error ? error.message : 'QR Code อาจไม่ถูกต้องหรือหมดอายุแล้ว กรุณาสแกนใหม่อีกครั้ง หรือสอบถามพนักงานที่ร้าน'}
          </p>
          <button type="button" className="secondary" onClick={() => window.location.reload()} style={{ width: '100%', padding: '10px' }}>
            ลองโหลดใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  if (sessionData.expired) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f8ff', padding: '20px' }}>
        <div style={{ maxWidth: '380px', textAlign: 'center', background: '#fff', padding: '32px 24px', borderRadius: '16px', border: '1px solid #d7e5f6' }}>
          <CheckCircle2 size={48} color="#16825d" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', color: '#102f5d', margin: '0 0 8px' }}>รอบการทานนี้เสร็จสิ้นแล้ว</h2>
          <p style={{ fontSize: '13px', color: '#607a9d', margin: '0 0 20px', lineHeight: 1.6 }}>
            {sessionData.message || 'โต๊ะนี้ได้ทำการปิดหรือชำระเงินเรียบร้อยแล้ว ขอบคุณที่มาใช้บริการครับ'}
          </p>
          <div style={{ fontSize: '11px', color: '#8aa1bf', borderTop: '1px solid #eef3f9', paddingTop: '12px' }}>
            {sessionData.tenant.name} · โต๊ะ {sessionData.table.number}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '520px',
        margin: '0 auto',
        minHeight: '100vh',
        background: '#f5f8ff',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 40px rgba(0,0,0,.08)',
        position: 'relative',
      }}
    >
      {/* ─── Top Brand Header ─── */}
      <header
        style={{
          background: 'linear-gradient(135deg, #0753bd, #0877ee)',
          color: '#fff',
          padding: '18px 20px',
          borderBottomLeftRadius: '20px',
          borderBottomRightRadius: '20px',
          boxShadow: '0 6px 20px rgba(8,119,238,.2)',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={logo}
              alt="Logo"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fff',
                padding: '2px',
              }}
            />
            <div>
              <div style={{ fontSize: '11px', color: '#bfe3ff', fontWeight: 600 }}>
                {sessionData.tenant.name} · {sessionData.branch.name}
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>
                สั่งอาหารออนไลน์
              </h1>
            </div>
          </div>

          {/* Table Badge */}
          <div
            style={{
              background: 'rgba(255,255,255,.18)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,.3)',
              borderRadius: '12px',
              padding: '6px 12px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10px', color: '#dceeff', display: 'block', fontWeight: 600 }}>
              โต๊ะของคุณ
            </span>
            <strong style={{ fontSize: '16px', color: '#fff', letterSpacing: '-0.3px' }}>
              {sessionData.table.number}
            </strong>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            background: 'rgba(0,0,0,.15)',
            borderRadius: '12px',
            padding: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('MENU')}
            style={{
              flex: 1,
              padding: '8px',
              border: 0,
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'MENU' ? '#fff' : 'transparent',
              color: activeTab === 'MENU' ? '#0753bd' : '#bfe3ff',
              transition: 'all .2s ease',
            }}
          >
            เมนูอาหาร
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TRACKING')}
            style={{
              flex: 1,
              padding: '8px',
              border: 0,
              borderRadius: '9px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'TRACKING' ? '#fff' : 'transparent',
              color: activeTab === 'TRACKING' ? '#0753bd' : '#bfe3ff',
              transition: 'all .2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>ออเดอร์ที่สั่งแล้ว</span>
            {sessionData.itemCount > 0 && (
              <span
                style={{
                  background: activeTab === 'TRACKING' ? '#0877ee' : '#fff',
                  color: activeTab === 'TRACKING' ? '#fff' : '#0753bd',
                  fontSize: '10px',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontWeight: 800,
                }}
              >
                {sessionData.itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Success Banner */}
      {orderSuccessNotice && (
        <div
          style={{
            margin: '12px 16px 0',
            background: '#e8f8ef',
            border: '1px solid #b6e2c9',
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#16825d',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 700,
            animation: 'pp-pulse 1.2s ease-in-out',
          }}
        >
          <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
          <span>ส่งรายการอาหารเข้าครัวเรียบร้อยแล้ว! กำลังจัดเตรียมให้ครับ</span>
        </div>
      )}

      {/* ─── TAB 1: MENU ─── */}
      {activeTab === 'MENU' && (
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Search Bar */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #cfe1f7',
              borderRadius: '12px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Search size={16} color="#607a9d" />
            <input
              type="text"
              placeholder="ค้นหาชื่ออาหาร, เครื่องดื่ม…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 0, outline: 0, background: 'transparent', padding: '2px', fontSize: '13px', width: '100%' }}
            />
            {searchQuery && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setSearchQuery('')}
                style={{ padding: '2px', color: '#607a9d' }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Menu Items List */}
          <div style={{ display: 'grid', gap: '10px' }}>
            {filteredMenu.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#607a9d' }}>
                <Utensils size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                <div style={{ fontSize: '14px', fontWeight: 600 }}>ไม่พบรายการอาหารที่ค้นหา</div>
              </div>
            ) : (
              filteredMenu.map(item => {
                const inCart = cart[item.id]?.quantity || 0;
                const isOutOfStock = !item.inStock;

                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#fff',
                      border: inCart > 0 ? '1px solid #0877ee' : '1px solid #e2ecf8',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      opacity: isOutOfStock ? 0.6 : 1,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#102f5d' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#607a9d', marginTop: '2px' }}>
                        {item.sku}
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0877ee', marginTop: '6px' }}>
                        ฿{item.price.toFixed(2)}
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    {isOutOfStock ? (
                      <span className="pill" style={{ background: '#f1f5f9', color: '#94a3b8', fontSize: '11px' }}>
                        สินค้าหมด
                      </span>
                    ) : inCart > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid #d7e5f6',
                            background: '#fff',
                            color: '#0753bd',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Minus size={15} />
                        </button>
                        <span style={{ fontSize: '14px', fontWeight: 800, minWidth: '20px', textAlign: 'center', color: '#102f5d' }}>
                          {inCart}
                        </span>
                        <button
                          type="button"
                          onClick={() => addToCart(item.id)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: 0,
                            background: '#0877ee',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToCart(item.id)}
                        className="secondary"
                        style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '10px', gap: '4px' }}
                      >
                        <Plus size={14} />
                        <span>เพิ่ม</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: ORDER TRACKING ─── */}
      {activeTab === 'TRACKING' && (
        <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Running Bill Header */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #cfe1f7',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: '#607a9d', display: 'block' }}>ยอดรวมที่สั่งไปแล้ว</span>
              <strong style={{ fontSize: '24px', color: '#0877ee', fontWeight: 900 }}>
                ฿{sessionData.runningTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <span
              className="pill"
              style={{ background: '#eaf4ff', color: '#0753bd', fontSize: '11px', padding: '6px 12px' }}
            >
              สั่งไปแล้ว {sessionData.itemCount} จาน
            </span>
          </div>

          {/* Orders History */}
          {sessionData.orders.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
                background: '#fff',
                borderRadius: '14px',
                border: '1px dashed #d7e5f6',
                color: '#607a9d',
              }}
            >
              <Utensils size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <h3 style={{ fontSize: '15px', color: '#102f5d', margin: '0 0 4px' }}>ยังไม่มีออเดอร์ในโต๊ะนี้</h3>
              <p style={{ fontSize: '12px', margin: '0 0 16px' }}>เลือกรายการอาหารและกดส่งออเดอร์ได้เลยครับ</p>
              <button
                type="button"
                className="primary"
                onClick={() => setActiveTab('MENU')}
                style={{ padding: '8px 18px', fontSize: '12px' }}
              >
                ดูเมนูอาหาร
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {sessionData.orders.map((order, idx) => (
                <div
                  key={order.id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2ecf8',
                    borderRadius: '14px',
                    padding: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#607a9d' }}>
                      รอบสั่งที่ {sessionData.orders.length - idx} · {order.orderNumber}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background:
                          order.status === 'PENDING'
                            ? '#ffedd5'
                            : order.status === 'COOKING'
                            ? '#e0f2fe'
                            : '#e8f8ef',
                        color:
                          order.status === 'PENDING'
                            ? '#c2410c'
                            : order.status === 'COOKING'
                            ? '#0369a1'
                            : '#16825d',
                      }}
                    >
                      {order.status === 'PENDING' ? '⏳ ครัวกำลังรับออเดอร์' : order.status === 'COOKING' ? '🍳 กำลังปรุงอาหาร' : '✓ เสิร์ฟเรียบร้อย'}
                    </span>
                  </div>

                  {order.items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        fontSize: '13px',
                        padding: '4px 0',
                        borderBottom: '1px dotted #f0f4fa',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: '#102f5d' }}>{item.name}</span>
                        {item.note && (
                          <small style={{ display: 'block', color: '#ea580c', fontSize: '10px' }}>
                            * {item.note}
                          </small>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                        <span style={{ color: '#607a9d' }}>x{Number(item.quantity)}</span>
                        <span style={{ fontWeight: 700, color: '#102f5d' }}>
                          ฿{Number(item.subtotal).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Bottom Floating Cart Bar (When Cart Has Items) ─── */}
      {cartSummary.totalQty > 0 && !showCartDrawer && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 16px',
            background: 'rgba(255,255,255,.9)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid #d7e5f6',
            boxShadow: '0 -4px 20px rgba(0,0,0,.06)',
            zIndex: 20,
          }}
        >
          <button
            type="button"
            className="primary"
            onClick={() => setShowCartDrawer(true)}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: '14px',
              fontSize: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={18} />
              <span>ดูตะกร้า ({cartSummary.totalQty} รายการ)</span>
            </div>
            <strong>฿{cartSummary.totalPrice.toFixed(2)}</strong>
          </button>
        </div>
      )}

      {/* ─── Cart Drawer Modal ─── */}
      {showCartDrawer && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 50, padding: 0, alignItems: 'flex-end' }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#fff',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,.15)',
              overflow: 'hidden',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2ecf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={18} color="#0877ee" />
                <h3 style={{ fontSize: '16px', margin: 0, color: '#102f5d' }}>
                  ตะกร้าสั่งอาหาร (รอบนี้)
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCartDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                {cartSummary.items.map(item => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid #e2ecf8',
                      borderRadius: '12px',
                      padding: '12px',
                      background: '#fbfdff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#102f5d' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0877ee', marginTop: '2px' }}>
                          ฿{item.subtotal.toFixed(2)}
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #d7e5f6',
                            background: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Minus size={13} />
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '18px', textAlign: 'center' }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => addToCart(item.id)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 0,
                            background: '#0877ee',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Note input for this item */}
                    <input
                      type="text"
                      placeholder="ระบุข้อความพิเศษ เช่น ไม่ใส่ถั่วงอก, หวานน้อย"
                      value={item.note}
                      onChange={e => updateItemNote(item.id, e.target.value)}
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: '1px solid #dce4df',
                        width: '100%',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Order Level Note */}
              <div style={{ marginTop: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#607a9d', display: 'block', marginBottom: '6px' }}>
                  หมายเหตุเพิ่มเติมสำหรับครัว (ถ้ามี)
                </span>
                <textarea
                  rows={2}
                  placeholder="เช่น เสิร์ฟพร้อมกันทุกจาน, ขอจานแบ่งเพิ่ม"
                  value={orderNote}
                  onChange={e => setOrderNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #dce4df',
                  }}
                />
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: '16px',
                borderTop: '1px solid #e2ecf8',
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#607a9d' }}>ยอดรวมรอบนี้ ({cartSummary.totalQty} รายการ)</span>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#0877ee' }}>
                  ฿{cartSummary.totalPrice.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => submitOrderMutation.mutate()}
                disabled={submitOrderMutation.isPending || cartSummary.totalQty === 0}
                style={{ width: '100%', padding: '14px', fontSize: '14px', gap: '8px' }}
              >
                <Send size={16} />
                <span>{submitOrderMutation.isPending ? 'กำลังส่งเข้าครัว…' : 'ยืนยันส่งออเดอร์เข้าครัว'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
