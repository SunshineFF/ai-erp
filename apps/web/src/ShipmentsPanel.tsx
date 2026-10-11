import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, PackageCheck, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { apiRequest } from "./apiClient";
import { DeleteConfirm } from "./shared/DeleteConfirm";
import { ListFilters, useListQueryFilters, RemoteSelectField } from "./shared/BusinessUi";
import { request } from "./api";

const fetchCustomerFilterOptions = async (keyword: string) => { const items = await request<any[]>(`/customers/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.filter((item) => item.isActive).map((item) => [item.id, item.name] as [string, string]); };
import { Pagination } from "./shared/Pagination";
import { usePaginatedResource } from "./hooks/usePaginatedResource";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3030/api";
async function api<T = any>(path: string, options?: RequestInit) { return apiRequest<T>(API, path, options); }

type Material = { id: string; code: string; name: string };
type Pick = { quantity: string };

export function ShipmentsPanel({ customers, materials, initialOrderId, onInitialOrderConsumed }: { customers: any[]; materials: Material[]; initialOrderId?: string; onInitialOrderConsumed: () => void }) {
  const [sales, setSales] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [shippedAt, setShippedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { partnerFilter: customerFilter, createdDate, createdDateEnd, setPartnerFilter: setCustomerFilter, setCreatedDate, setCreatedDateEnd, clearFilters } = useListQueryFilters();
  const shipmentResource = usePaginatedResource<any>("/sales-orders/shipments", { partnerId: customerFilter, createdFrom: createdDate, createdTo: createdDateEnd });
  const [deleteShipment, setDeleteShipment] = useState<any>(); const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const bootstrap = await api<any>("/sales-orders/shipment-bootstrap");
      setSales(bootstrap.orders ?? []); setBalances(bootstrap.balances ?? []); setBatches(bootstrap.batches ?? []); setLocations(bootstrap.locations ?? []); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "出库单加载失败"); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (initialOrderId && sales.some((order) => order.id === initialOrderId)) {
      setSelectedId(initialOrderId); setPicks({}); setCreating(true); onInitialOrderConsumed();
    }
  }, [initialOrderId, sales]);

  const eligibleOrders = sales.filter((order) => ["DRAFT", "CONFIRMED", "READY", "IN_PRODUCTION", "PARTIALLY_SHIPPED"].includes(order.status));
  const filteredShipments = shipmentResource.items;
  const order = selectedOrder ?? sales.find((item) => item.id === selectedId);
  const remainingLines = order?.lines?.filter((line: any) => Number(line.shippedQty) < Number(line.quantity) - 0.000001) ?? [];
  const stockFor = (materialId: string) => balances.filter((balance) => balance.materialId === materialId && Number(balance.availableQty) > 0).map((balance) => ({ ...balance, batch: batches.find((batch) => batch.id === balance.batchId), location: locations.find((location) => location.id === balance.locationId) }));
  // 自动按批次扣减：无需手动选择批次，按效期先后从多个可用批次依次扣满本次出库量；总库存不足时由后端拒绝超发
  const allocateFor = (materialId: string, need: number) => { const stocks = stockFor(materialId).sort((a, b) => new Date(a.batch?.expiryDate ?? 0).getTime() - new Date(b.batch?.expiryDate ?? 0).getTime()); let left = need; const out: { balance: any; qty: number }[] = []; for (const stock of stocks) { if (left <= 0) break; const take = Math.min(left, Number(stock.availableQty)); if (take > 0) out.push({ balance: stock, qty: take }); left -= take; } return out; };
  const stockTotal = (materialId: string) => stockFor(materialId).reduce((sum, stock) => sum + Number(stock.availableQty), 0);
  const pickFor = (line: any): Pick => { const existing = picks[line.id]; if (existing) return existing; const quantity = String(Number(line.quantity) - Number(line.shippedQty)); return { quantity }; };
  const estimatedAmount = useMemo(() => remainingLines.reduce((sum: number, line: any) => sum + (Number(line.grossAmount) || Number(line.unitPrice) * Number(line.quantity)) * (Number(pickFor(line).quantity) || 0) / Number(line.quantity), 0), [remainingLines, picks]);

  const createShipment = async () => {
    if (!order) return;
    setSaving(true); setError("");
    try {
      const lines: any[] = [];
      for (const line of remainingLines) {
        const qty = Number(pickFor(line).quantity);
        if (qty <= 0) continue;
        for (const alloc of allocateFor(line.materialId, qty)) lines.push({ salesOrderLineId: line.id, batchId: alloc.balance.batchId, locationId: alloc.balance.locationId, quantity: alloc.qty });
      }
      if (!lines.length) throw new Error("至少选择一行物料，且出库数量大于零");
      await api(`/sales-orders/${order.id}/shipments`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ shippedAt, lines }) });
      setCreating(false); setSelectedId(""); setPicks({});
      await Promise.all([load(), shipmentResource.reload()]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "出库失败"); } finally { setSaving(false); }
  };
  const removeShipment = async () => { if (!deleteShipment) return; setDeleting(true); setError(""); try { await api(`/sales-orders/shipments/${deleteShipment.id}`, { method: "DELETE" }); setDeleteShipment(undefined); await shipmentResource.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败"); } finally { setDeleting(false); } };
  // 销售退货：按原发货批次回补库存，支持对发货行部分退回（退回数量修正对应 salesOrderLine.returnedQty）
  const [returnDrafts, setReturnDrafts] = useState<Record<string, Record<string, string>>>({});
  const [returning, setReturning] = useState(false);
  const returnDraftOf = (shipmentId: string, lineId: string) => returnDrafts[shipmentId]?.[lineId] ?? "";
  const patchReturnDraft = (shipmentId: string, lineId: string, value: string) => setReturnDrafts((current) => ({ ...current, [shipmentId]: { ...(current[shipmentId] ?? {}), [lineId]: value } }));
  const shipReturn = async (shipment: any, line: any) => {
    const max = Number(line.quantity) - Number(line.returnedQty ?? 0);
    const qty = Number(returnDraftOf(shipment.id, line.id));
    if (!qty || qty <= 0) { setError("退货数量必须大于零"); return; }
    if (qty > max + 0.000001) { setError(`退货数量超过该行可退数量 ${max}`); return; }
    setReturning(true); setError("");
    try {
      await api(`/sales-orders/shipments/${shipment.id}/returns`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines: [{ shipmentLineId: line.id, quantity: qty }] }) });
      setReturnDrafts((current) => { const next = { ...current }; if (next[shipment.id]) { const copy = { ...next[shipment.id] }; delete copy[line.id]; next[shipment.id] = copy; } return next; });
      await Promise.all([load(), shipmentResource.reload()]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "退货失败"); } finally { setReturning(false); }
  };

  return (
    <section className="panel table-panel shipments-panel">
      <div className="panel-title">
        <PackageCheck size={18} /><h2>出库单</h2>
        <div className="order-toolbar">
          <button className="ghost-action icon-text" onClick={() => void Promise.all([load(), shipmentResource.reload()])}><RefreshCw size={14} />刷新</button>
          <button className="primary small icon-text" onClick={() => { setCreating(true); setSelectedId(""); setPicks({}); }}><Plus size={14} />新增出库单</button>
        </div>
      </div>
      <ListFilters partnerLabel="客户" partnerValue={customerFilter} partnerOptions={customers.map((customer) => [customer.id, customer.name])} partnerFetchOptions={fetchCustomerFilterOptions} createdDate={createdDate} createdDateEnd={createdDateEnd} resultCount={shipmentResource.total} onPartnerChange={(value) => { setCustomerFilter(value); setExpanded(null); }} onCreatedDateChange={(value) => { setCreatedDate(value); setExpanded(null); }} onCreatedDateEndChange={(value) => { setCreatedDateEnd(value); setExpanded(null); }} onClear={() => { clearFilters(); setExpanded(null); }} />
      {(error || shipmentResource.error) && <div className="error banner">{error || shipmentResource.error}</div>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>出库单号</th><th>出库人</th><th>目标客户</th><th>出库时间</th><th>累计金额</th><th>关联销售单</th><th>物料行</th><th>状态</th><th>创建日期</th><th>操作</th></tr></thead>
          {filteredShipments.map((shipment) => (
            <tbody key={shipment.id} className="shipment-row-group">
              <tr>
                <td>{shipment.documentNo}</td><td>{shipment.shippedByName || shipment.shippedBy?.displayName || "系统"}</td><td>{shipment.customer?.name ?? shipment.order?.customer?.name ?? "-"}</td><td>{new Date(shipment.shippedAt).toLocaleString()}</td><td>{Number(shipment.totalAmount).toFixed(2)} {shipment.currencyCode}</td><td>{shipment.order?.documentNo ?? "-"}</td><td>{shipment.lines?.length ?? 0}</td><td><span className={"status-badge " + shipmentStatusClass(shipment.status)}>{shipment.status_text ?? shipment.status}</span></td><td>{new Date(shipment.createdAt).toLocaleDateString()}</td>
                <td><span className="actions"><button className="link-button icon-text" onClick={() => setExpanded(expanded === shipment.id ? null : shipment.id)}>{expanded === shipment.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}查看</button><button className="link-button danger" onClick={() => setDeleteShipment(shipment)}>删除</button></span></td>
              </tr>
              {expanded === shipment.id && <tr><td colSpan={10}><div className="shipment-details">{shipment.lines?.map((line: any) => { const max = Number(line.quantity) - Number(line.returnedQty ?? 0); return <div className="shipment-detail-row" key={line.id}><span>{materialName(materials, line.materialId)}</span><span>数量 {Number(line.quantity)} · 单价 {Number(line.unitPrice).toFixed(2)}</span><strong>{Number(line.lineAmount).toFixed(2)} {shipment.currencyCode}</strong><span className="shipment-return-cell">{max > 0 ? <><input type="number" min="0" max={max} step="any" placeholder={`可退 ${max}`} value={returnDraftOf(shipment.id, line.id)} onChange={(event) => patchReturnDraft(shipment.id, line.id, event.target.value)} /><button className="link-button" disabled={returning} onClick={() => void shipReturn(shipment, line)}><RotateCcw size={13} />退货</button></> : <span className="muted">已全部退回</span>}</span></div>; })}</div></td></tr>}
            </tbody>
          ))}
        </table>
        {!filteredShipments.length && <div className="empty">暂无符合条件的出库单</div>}
      </div>
      <Pagination page={shipmentResource.page} pageSize={shipmentResource.pageSize} total={shipmentResource.total} onPageChange={shipmentResource.setPage} onPageSizeChange={shipmentResource.setPageSize} />
      <DeleteConfirm target={deleteShipment ? { title: deleteShipment.documentNo, run: async () => undefined } : undefined} busy={deleting} error={error} onClose={() => setDeleteShipment(undefined)} onConfirm={() => void removeShipment()} />
      {creating && (
        <div className="modal-backdrop"><div className="modal shipment-modal">
          <div className="modal-header"><h2>创建出库单</h2><button className="icon-button" type="button" onClick={() => setCreating(false)}><X size={18} /></button></div>
          <div className="shipment-form">
            <RemoteSelectField label="关联销售单" value={selectedId} onChange={(v) => { setSelectedId(v); setPicks({}); setSelectedOrder(null); if (v) { void api<any>(`/sales-orders/${v}`).then((detail) => setSelectedOrder(detail)).catch(() => setSelectedOrder(null)); } }} fetchOptions={async (keyword: string) => { const items = await api<any[]>(`/sales-orders/options?take=10&status=DRAFT,CONFIRMED,READY,IN_PRODUCTION,PARTIALLY_SHIPPED${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.map((item) => [item.id, `${item.customer?.name ?? "客户"} · ${item.documentNo}`]); }} initialOptions={eligibleOrders.map((item) => [item.id, `${item.customer?.name ?? "客户"} · ${item.documentNo}`])} />
            <label>出库时间<input type="datetime-local" value={shippedAt} onChange={(event) => setShippedAt(event.target.value)} /></label>
            {order && <div className="shipment-summary"><span>目标客户：<strong>{order.customer?.name}</strong></span><span>关联销售单：<strong>{order.documentNo}</strong></span></div>}
            {remainingLines.map((line: any) => {
              const pick = pickFor(line);
              const remaining = Number(line.quantity) - Number(line.shippedQty);
              const qty = Number(pick.quantity) || 0;
              const alloc = allocateFor(line.materialId, qty);
              const total = stockTotal(line.materialId);
              return <div className="shipment-line-editor" key={line.id}><div><strong>{materialName(materials, line.materialId)}</strong><small>销售 {Number(line.quantity)} · 已出 {Number(line.shippedQty)} · 剩余 {remaining}</small></div><label>本次出库数量<input type="number" min="0" max={remaining} step="any" value={pick.quantity} onChange={(event) => setPicks((current) => ({ ...current, [line.id]: { ...pick, quantity: event.target.value } }))} /></label><div><p className="muted">可用库存 {total}{qty > total && <span className="warning"> · 可用库存不足</span>}</p>{alloc.length > 0 && <div className="auto-alloc-list">{alloc.map((item) => <div className="list-row" key={`${item.balance.batchId}:${item.balance.locationId}`}><span>{item.balance.batch?.batchNo ?? "批次"} · {item.balance.location?.name ?? "库位"} · 扣减 {item.qty}</span></div>)}</div>}</div></div>;
            })}
            {order && !remainingLines.length && <div className="empty">该销售单已全部出库</div>}
            <div className="shipment-total"><span>本次累计金额</span><strong>{estimatedAmount.toFixed(2)} {order?.currencyCode ?? "CNY"}</strong></div>
            <button className="primary" disabled={saving || !order || !remainingLines.length} onClick={() => void createShipment()}>{saving ? "出库中..." : "确认出库"}</button>
          </div>
        </div></div>
      )}
    </section>
  );
}

function materialName(materials: Material[], id: string) { return materials.find((item) => item.id === id)?.name ?? "物料"; }
function shipmentStatusClass(status?: string) { if (status === "POSTED") return "status-shipped"; if (status === "REVERSED" || status === "CANCELLED") return "status-muted"; return "status-muted"; }
