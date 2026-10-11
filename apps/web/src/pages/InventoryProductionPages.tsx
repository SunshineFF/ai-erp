import { useSearchParams } from "react-router-dom";
import { Boxes, Warehouse } from "lucide-react";
import { InventoryPanel, InventorySummaryTable, InventoryTransactionsTable, transactionTypeLabels } from "../features/inventory/InventoryPanel";
import { ProductionPanel } from "../features/production/ProductionPanel";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { Paged, useAuxiliaryData } from "./PageSupport";

type InventoryTab = "balances" | "batches" | "transactions";
const inventoryTabs: [InventoryTab, string, React.ReactNode][] = [["balances", "库存列表", <Boxes size={16} key="balances-icon" />], ["batches", "库存批次", <Warehouse size={16} key="batches-icon" />], ["transactions", "库存变动记录", <Warehouse size={16} key="transactions-icon" />]];

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: InventoryTab = inventoryTabs.some(([key]) => key === tabParam) ? (tabParam as InventoryTab) : "balances";
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); next.set("page", "1"); setParams(next); };
  const extra: Record<string, string> = { q: params.get("q") ?? "", ...(tab === "transactions" ? { type: params.get("type") ?? "" } : {}) };
  const resource = usePaginatedResource<any>(tab === "batches" ? "/inventory/batches" : "/inventory/transactions", extra);
  const { bootstrap } = useAuxiliaryData();
  const materials = bootstrap.materials ?? [];
  const switchTab = (key: InventoryTab) => { const next = new URLSearchParams(params); next.set("tab", key); next.set("page", "1"); setParams(next); };
  const q = params.get("q") ?? ""; const type = params.get("type") ?? "";
  const filterActive = Boolean(q || type);
  return <section className="panel table-panel">
    <div className="panel-title"><Warehouse size={18} /><h2>库存</h2></div>
    <div className="tabs">{inventoryTabs.map(([key, label, icon]) => <button key={key} className={tab === key ? "tab active icon-text" : "tab icon-text"} onClick={() => switchTab(key)}>{icon}{label}</button>)}</div>
    {tab === "balances" ? <InventorySummaryTable materials={materials} /> : <Paged resource={resource}>{tab === "transactions" ? <><div className="list-filters"><label><span>关键字</span><input type="text" placeholder="搜索事务号 / 物料" value={q} onChange={(event) => setFilter("q", event.target.value)} /></label><label><span>类型</span><select value={type} onChange={(event) => setFilter("type", event.target.value)}><option value="">全部类型</option>{Object.entries(transactionTypeLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><span className="filter-count">{resource.total} 条记录</span>{filterActive && <button type="button" className="ghost-action" onClick={() => { setFilter("q", ""); setFilter("type", ""); }}>清除筛选</button>}</div><InventoryTransactionsTable data={resource.items} materials={materials} /></> : <><div className="list-filters"><label><span>关键字</span><input type="text" placeholder="搜索批次号 / 物料" value={q} onChange={(event) => setFilter("q", event.target.value)} /></label><span className="filter-count">{resource.total} 条记录</span>{filterActive && <button type="button" className="ghost-action" onClick={() => setFilter("q", "")}>清除筛选</button>}</div><InventoryPanel data={resource.items} materials={materials} refresh={resource.reload} /></>}</Paged>}
  </section>;
}
export function ProductionOrdersPage() { const [params] = useSearchParams(); const extra = { partnerId: params.get("partnerId") ?? "", createdFrom: params.get("createdFrom") ?? "", createdTo: params.get("createdTo") ?? "" }; const resource = usePaginatedResource<any>("/production-orders", extra); const { bootstrap, customers, sales } = useAuxiliaryData({ customers: true, sales: true }); return <Paged resource={resource}><ProductionPanel data={resource.items} sales={sales} customers={customers} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }