import { useState } from "react";
import { Factory } from "lucide-react";
import type { Material } from "../../types";
import { Actions, createdDateInRange, DataTable, ListFilters, materialLabel, Modal, PanelHeader, ProductionForm, request, useListQueryFilters } from "../../shared/BusinessUi";

const fetchCustomerFilterOptions = async (keyword: string) => { const items = await request<any[]>(`/customers/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.filter((item) => item.isActive).map((item) => [item.id, item.name] as [string, string]); };

export function ProductionPanel({ data, sales, customers, materials, refresh }: { data: any[]; sales: any[]; customers: any[]; materials: Material[]; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<any>(null);
  const { partnerFilter: customerFilter, createdDate, createdDateEnd, setPartnerFilter: setCustomerFilter, setCreatedDate, setCreatedDateEnd, clearFilters } = useListQueryFilters();
  // 关联销售单：优先取 ProductionOrderLink（多关联），回退到旧 sourceSalesOrderId（单关联）。
  const linkedSalesIds = (order: any) => order.salesOrderLinks?.length ? order.salesOrderLinks.map((link: any) => link.salesOrderId) : order.sourceSalesOrderId ? [order.sourceSalesOrderId] : [];
  const sourceOrders = (order: any) => linkedSalesIds(order).map((id: string) => sales.find((sale) => sale.id === id)).filter(Boolean);
  const filteredData = data.filter((order) => {
    const linked = sourceOrders(order);
    return (!customerFilter || linked.some((sale: any) => sale?.customerId === customerFilter)) && ((!createdDate && !createdDateEnd) || createdDateInRange(order.createdAt, createdDate, createdDateEnd));
  });
  const save = async (form: any) => { if (editing?.id) await request(`/production-orders/${editing.id}`, { method: "PATCH", body: JSON.stringify({ plannedQty: Number(form.plannedQty), plannedDate: form.plannedDate, remark: form.remark }) }); else await request("/production-orders", { method: "POST", body: JSON.stringify({ ...form, plannedQty: Number(form.plannedQty) }) }); setEditing(null); await refresh(); };
  const release = async (id: string) => { await request(`/production-orders/${id}/release`, { method: "PATCH" }); await refresh(); };
  const summary = (order: any) => order.outputLines?.length ? order.outputLines.map((line: any) => `${materialLabel(materials, line.materialId)} × ${line.plannedQty}`).join("；") : `${materialLabel(materials, order.outputMaterialId)} × ${order.plannedQty}`;
  return <section className="panel table-panel"><PanelHeader icon={<Factory size={18} />} title="生产订单" action="新增订单" onAction={() => setEditing({})} /><ListFilters partnerLabel="客户" partnerValue={customerFilter} partnerOptions={customers.map((customer) => [customer.id, customer.name])} partnerFetchOptions={fetchCustomerFilterOptions} createdDate={createdDate} createdDateEnd={createdDateEnd} resultCount={filteredData.length} onPartnerChange={setCustomerFilter} onCreatedDateChange={setCreatedDate} onCreatedDateEndChange={setCreatedDateEnd} onClear={() => { setCustomerFilter(""); setCreatedDate(""); setCreatedDateEnd(""); }} /><DataTable columns={["单号", "客户", "产出物料排产", "产出行", "类型", "状态", "来源", "创建日期", "操作"]} rows={filteredData.map((o) => { const linked = sourceOrders(o); const customerNames = [...new Set(linked.map((sale: any) => sale?.customer?.name).filter(Boolean))]; return [o.documentNo, customerNames.join("、") || "-", summary(o), o.outputLines?.length ?? 1, o.productionType, o.status, linked.length ? linked.map((sale: any) => `销售订单 · ${sale.documentNo}`).join("；") : "手工", new Date(o.createdAt).toLocaleDateString(), <span className="actions" key={o.id}>{o.status === "DRAFT" && <button className="link-button" onClick={() => void release(o.id)}>下达</button>}<Actions onEdit={o.status === "DRAFT" && (o.outputLines?.length ?? 1) <= 1 ? () => setEditing(o) : undefined} onDelete={o.status === "DRAFT" ? async () => { await request(`/production-orders/${o.id}`, { method: "DELETE" }); await refresh(); } : undefined} /></span>]; })} /><Modal open={Boolean(editing)} title={editing?.id ? "编辑生产订单" : "新增生产订单"} onClose={() => setEditing(null)}><ProductionForm initial={editing} materials={materials} onSubmit={save} /></Modal></section>;
}
