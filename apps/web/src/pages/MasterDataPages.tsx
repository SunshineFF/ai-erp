import { BomsPanel } from "../features/boms/BomsPanel";
import { MaterialsPanel } from "../features/materials/MaterialsPanel";
import { PartnersPanel } from "../features/partners/PartnersPanel";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import type { Material } from "../types";
import { Paged, useAuxiliaryData } from "./PageSupport";
import { useSearchParams } from "react-router-dom";
export function MaterialsPage() { const [params] = useSearchParams(); const extra = { q: params.get("q") ?? "", type: params.get("type") ?? "", categoryId: params.get("categoryId") ?? "" }; const resource = usePaginatedResource<Material>("/materials", extra); return <Paged resource={resource}><MaterialsPanel data={resource.items} total={resource.total} refresh={resource.reload} /></Paged>; }
export function BomsPage() { const [params] = useSearchParams(); const extra = { q: params.get("q") ?? "", status: params.get("status") ?? "" }; const resource = usePaginatedResource<any>("/boms", extra); const { bootstrap } = useAuxiliaryData({ topLevelMaterials: true }); return <Paged resource={resource}><BomsPanel data={resource.items} total={resource.total} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }
export function SuppliersPage() { const [params] = useSearchParams(); const extra = { q: params.get("q") ?? "" }; const resource = usePaginatedResource<any>("/suppliers", extra); return <Paged resource={resource}><PartnersPanel kind="supplier" data={resource.items} total={resource.total} refresh={resource.reload} /></Paged>; }
export function CustomersPage() { const [params] = useSearchParams(); const extra = { q: params.get("q") ?? "" }; const resource = usePaginatedResource<any>("/customers", extra); return <Paged resource={resource}><PartnersPanel kind="customer" data={resource.items} total={resource.total} refresh={resource.reload} /></Paged>; }
