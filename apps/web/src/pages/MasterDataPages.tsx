import { BomsPanel } from "../features/boms/BomsPanel";
import { MaterialsPanel } from "../features/materials/MaterialsPanel";
import { PartnersPanel } from "../features/partners/PartnersPanel";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import type { Material } from "../types";
import { Paged, useAuxiliaryData } from "./PageSupport";
export function MaterialsPage() { const resource = usePaginatedResource<Material>("/materials"); return <Paged resource={resource}><MaterialsPanel data={resource.items} refresh={resource.reload} /></Paged>; }
export function BomsPage() { const resource = usePaginatedResource<any>("/boms"); const { bootstrap } = useAuxiliaryData({ topLevelMaterials: true }); return <Paged resource={resource}><BomsPanel data={resource.items} materials={bootstrap.materials ?? []} refresh={resource.reload} /></Paged>; }
export function SuppliersPage() { const resource = usePaginatedResource<any>("/suppliers"); return <Paged resource={resource}><PartnersPanel kind="supplier" data={resource.items} refresh={resource.reload} /></Paged>; }
export function CustomersPage() { const resource = usePaginatedResource<any>("/customers"); return <Paged resource={resource}><PartnersPanel kind="customer" data={resource.items} refresh={resource.reload} /></Paged>; }
