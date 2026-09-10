import { FormEvent, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, Product } from './api';

type Movement = {
  id: string; type: 'RECEIVE' | 'ADJUSTMENT'; quantity: string; balanceBefore: string; balanceAfter: string;
  note: string; createdAt: string; product: { name: string; sku: string }; actor: { user: { displayName: string } };
};
type HistoryPage = { items: Movement[]; nextCursor: string | null };
const quantity = (value: string) => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 3 });

export function StockForm({ product, branch, close, saved }: { product: Product; branch: { id: string; name: string }; close: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<'RECEIVE' | 'ADJUSTMENT'>('RECEIVE');
  // Freeze a submitted payload so a network retry cannot produce a second stock movement.
  const submitted = useRef<Record<string, unknown> | null>(null);
  const [locked, setLocked] = useState(false);
  const mutation = useMutation({ mutationFn: (body: Record<string, unknown>) => api('/inventory/movements', body), onSuccess: saved });
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitted.current) submitted.current = { ...Object.fromEntries(new FormData(event.currentTarget)), type, productId: product.id, branchId: branch.id, requestId: crypto.randomUUID() };
    setLocked(true);
    mutation.mutate(submitted.current);
  }
  return <dialog className="modal" ref={dialog} aria-labelledby="stock-title" onCancel={event => { event.preventDefault(); if (!mutation.isPending) close(); }}>
    <div className="section-heading"><h2 id="stock-title">รับเข้า / ปรับสต็อก</h2><button className="icon-button" aria-label="ปิด" disabled={mutation.isPending} onClick={close}><X /></button></div>
    <p><strong>{product.name}</strong><br /><span className="muted">{branch.name} · คงเหลือล่าสุด {quantity(product.quantity)}</span></p>
    <form onSubmit={submit}><fieldset disabled={locked} className="stock-fields">
      <label>ประเภทรายการ<select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="RECEIVE">รับเข้าสินค้า</option><option value="ADJUSTMENT">ปรับเพิ่ม / ลดสต็อก</option></select></label>
      <label>{type === 'RECEIVE' ? 'จำนวนรับเข้า' : 'จำนวนที่ต้องการเพิ่มหรือลด'}<input autoFocus name="quantity" type="number" step="0.001" min={type === 'RECEIVE' ? '0.001' : '-99999999999.999'} max="99999999999.999" required placeholder={type === 'RECEIVE' ? 'เช่น 10' : 'เช่น -2 เพื่อลดลง 2 หน่วย'} /></label>
      <p className="help">{type === 'RECEIVE' ? 'เพิ่มจำนวนเข้าเฉพาะสาขาที่เลือก' : 'ระบุจำนวนที่เปลี่ยนแปลง ไม่ใช่ยอดคงเหลือใหม่ เช่น +5 หรือ -2'}</p>
      <label>เหตุผล / เอกสารอ้างอิง<textarea name="note" required maxLength={500} rows={3} placeholder="เช่น รับสินค้าตามใบส่งของ DN-001" /></label>
    </fieldset>
    {mutation.error && <div role="alert" className="error"><p>{mutation.error.message}</p><small>การลองอีกครั้งจะใช้คำขอเดิมและไม่เพิ่มยอดซ้ำ หากต้องแก้ข้อมูล ให้ปิดหน้าต่างและตรวจประวัติก่อนสร้างรายการใหม่</small></div>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={mutation.isPending} onClick={close}>ปิด</button><button className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'กำลังบันทึก…' : locked ? 'ลองคำขอเดิมอีกครั้ง' : 'บันทึกรายการ'}</button></div></form>
  </dialog>;
}

export function HistoryDialog({ branch, close }: { branch: { id: string; name: string }; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const history = useInfiniteQuery({
    queryKey: ['movements', branch.id], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ branchId: branch.id });
      if (pageParam) params.set('cursor', pageParam);
      return api<HistoryPage>(`/inventory/movements?${params}`);
    },
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const items = history.data?.pages.flatMap(page => page.items) ?? [];
  return <dialog ref={dialog} className="modal history-modal" aria-labelledby="history-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="section-heading"><h2 id="history-title">ประวัติสต็อก · {branch.name}</h2><button className="icon-button" aria-label="ปิด" onClick={close}><X /></button></div><p className="muted">เรียงจากรายการล่าสุด · เวลาตามอุปกรณ์ที่ใช้งาน</p>
    {history.isPending ? <p role="status">กำลังโหลดประวัติ…</p> : <>
      {history.isError && <p role="alert" className="error">{history.error.message}<button className="text-button" onClick={() => history.refetch()}>ลองอีกครั้ง</button></p>}
      {items.length > 0 ? <div className="table-scroll"><table><thead><tr><th>วันเวลา / ผู้บันทึก</th><th>สินค้า</th><th>ประเภท / เหตุผล</th><th className="numeric">เปลี่ยนแปลง</th><th className="numeric">ก่อน → หลัง</th></tr></thead><tbody>{items.map(item => <tr key={item.id}>
        <td>{new Date(item.createdAt).toLocaleString('th-TH')}<br /><small className="muted">{item.actor.user.displayName}</small></td>
        <td>{item.product.name}<br /><small className="muted">{item.product.sku}</small></td>
        <td>{item.type === 'RECEIVE' ? 'รับเข้า' : 'ปรับสต็อก'}<p className="movement-note">{item.note}</p></td>
        <td className={`numeric ${Number(item.quantity) < 0 ? 'negative' : 'positive'}`}>{Number(item.quantity) > 0 ? '+' : ''}{quantity(item.quantity)}</td>
        <td className="numeric">{quantity(item.balanceBefore)} → {quantity(item.balanceAfter)}</td>
      </tr>)}</tbody></table></div> : !history.isError && <div className="empty-state"><h3>ยังไม่มีรายการเคลื่อนไหว</h3><p>รับเข้าสินค้าหรือปรับสต็อก แล้วรายการจะแสดงที่นี่</p></div>}
      {history.hasNextPage && <button className="secondary" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>{history.isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดรายการก่อนหน้า'}</button>}
    </>}
  </dialog>;
}
