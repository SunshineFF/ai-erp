import { useSearchParams } from "react-router-dom";
import { InventoryPanel } from "../features/inventory/InventoryPanel";
import { ProductionPanel } from "../features/production/ProductionPanel";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { Paged, useAuxiliaryData } from "./PageSupport";
export function InventoryPage() { const resource = usePaginatedResource<any>("/inventory/batches"); const { bootstrap } = useAuxiliaryData(); return <Paged resource={resource}><InventoryPanel data={resource.items} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }
export function ProductionOrdersPage() { const [params] = useSearchParams(); const extra = { partnerId: params.get("partnerId") ?? "", createdFrom: params.get("createdFrom") ?? "", createdTo: params.get("createdTo") ?? "" }; const resource = usePaginatedResource<any>("/production-orders", extra); const { bootstrap, customers, sales } = useAuxiliaryData({ customers: true, sales: true }); return <Paged resource={resource}><ProductionPanel data={resource.items} sales={sales} customers={customers} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }
