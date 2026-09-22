import { useSearchParams } from "react-router-dom";
import { Boxes, Warehouse } from "lucide-react";
import { InventoryBalancesTable, InventoryPanel, InventoryTransactionsTable } from "../features/inventory/InventoryPanel";
import { ProductionPanel } from "../features/production/ProductionPanel";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { Paged, useAuxiliaryData } from "./PageSupport";

type InventoryTab = "balances" | "batches" | "transactions";
const inventoryTabs: [InventoryTab, string, React.ReactNode][] = [["balances", "库存列表", <Boxes size={16} key="balances-icon" />], ["batches", "库存批次", <Warehouse size={16} key="batches-icon" />], ["transactions", "库存变动记录", <Warehouse size={16} key="transactions-icon" />]];

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: InventoryTab = inventoryTabs.some(([key]) => key === tabParam) ? (tabParam as InventoryTab) : "balances";
  const resource = usePaginatedResource<any>(tab === "balances" ? "/inventory/balances" : tab === "batches" ? "/inventory/batches" : "/inventory/transactions");
  const { bootstrap } = useAuxiliaryData();
  const materials = bootstrap.materials ?? [];
  const switchTab = (key: InventoryTab) => { const next = new URLSearchParams(params); next.set("tab", key); next.set("page", "1"); setParams(next); };
  return <section className="panel table-panel">
    <div className="panel-title"><Warehouse size={18} /><h2>库存</h2></div>
    <div className="tabs">{inventoryTabs.map(([key, label, icon]) => <button key={key} className={tab === key ? "tab active icon-text" : "tab icon-text"} onClick={() => switchTab(key)}>{icon}{label}</button>)}</div>
    <Paged resource={resource}>{tab === "balances" ? <InventoryBalancesTable data={resource.items} materials={materials} /> : tab === "transactions" ? <InventoryTransactionsTable data={resource.items} materials={materials} /> : <InventoryPanel data={resource.items} materials={materials} refresh={resource.reload} />}</Paged>
  </section>;
}
export function ProductionOrdersPage() { const [params] = useSearchParams(); const extra = { partnerId: params.get("partnerId") ?? "", createdFrom: params.get("createdFrom") ?? "", createdTo: params.get("createdTo") ?? "" }; const resource = usePaginatedResource<any>("/production-orders", extra); const { bootstrap, customers, sales } = useAuxiliaryData({ customers: true, sales: true }); return <Paged resource={resource}><ProductionPanel data={resource.items} sales={sales} customers={customers} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }
